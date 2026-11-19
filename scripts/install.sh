#!/bin/sh
# Install Ri on a Mac or Linux computer: curl -fsSL <this file's address> | sh
#
# Installs software only, and asks no questions, since a piped script has no usable
# input on an SSH session. It checks the release's signature against the keys the root
# key below vouches for, and every file against its manifest, then makes sure `ri` in a
# new terminal runs Ri rather than Ruby's own `ri`. Run `ri start` afterwards.
# Options: --channel latest
#
# Everything is in functions and the last line calls main, so a download cut off
# partway runs nothing.
set -u

main() {
  set -e
  FEED="${RI_INSTALL_FEED:-__RI_FEED__}"
  # The publisher's root key, which every installation trusts for good (docs/publishing.md).
  ROOT_KEY_BASE64="${RI_INSTALL_ROOT_KEY_BASE64:-__RI_ROOT_KEY_BASE64__}"
  CHANNEL=stable
  while [ $# -gt 0 ]; do
    case "$1" in
      --channel) CHANNEL="${2:-}"; shift 2 ;;
      --channel=*) CHANNEL="${1#--channel=}"; shift ;;
      *) echo "Unknown option: $1" >&2; exit 2 ;;
    esac
  done
  case "$CHANNEL" in stable|latest) ;; *) echo "Choose --channel stable or latest." >&2; exit 2 ;; esac

  need curl; need tar; need base64; need sed
  case "$(uname -s)" in
    Darwin) PLATFORM=darwin ;;
    Linux) PLATFORM=linux ;;
    *) fail "this script installs Ri on macOS and Linux." ;;
  esac
  case "$(uname -m)" in
    arm64|aarch64) ARCH=arm64 ;;
    x86_64|amd64) ARCH=x64 ;;
    *) fail "there's no Ri for $(uname -m) yet." ;;
  esac
  if command -v sha256sum >/dev/null 2>&1; then sha256() { sha256sum "$1" | cut -d' ' -f1; }
  elif command -v shasum >/dev/null 2>&1; then sha256() { shasum -a 256 "$1" | cut -d' ' -f1; }
  else fail "this script needs sha256sum or shasum."; fi

  # In the home folder: /tmp is often too small to unpack a release into.
  WORK="$(mktemp -d "$HOME/.ri-install.XXXXXX")"
  trap 'rm -rf "$WORK"' EXIT INT TERM
  FEED="${FEED%/}"
  echo "Finding the newest Ri on the $CHANNEL channel for $PLATFORM-$ARCH..."
  curl -fsSL --proto '=https' --tlsv1.2 -o "$WORK/release.json" "$FEED/$CHANNEL-$PLATFORM-$ARCH.json" || fail "no release found at $FEED."
  # The keys that may sign a release, as the root key signed them.
  curl -fsSL --proto '=https' --tlsv1.2 -o "$WORK/keys.json" "$FEED/keys.json" || fail "no signing keys found at $FEED."
  PAYLOAD="$(sed -n 's/.*"payload":"\([^"]*\)".*/\1/p' "$WORK/release.json")"
  [ -n "$PAYLOAD" ] || fail "the release feed answered with something unexpected."
  printf '%s' "$PAYLOAD" | base64 --decode > "$WORK/payload.json" 2>/dev/null || printf '%s' "$PAYLOAD" | base64 -D > "$WORK/payload.json" || fail "the release feed answered with something unexpected."
  RUNTIME="$(sed -n 's/.*"runtime":{\([^}]*\)}.*/\1/p' "$WORK/payload.json")"
  URL="$(printf '%s' "$RUNTIME" | sed -n 's/.*"url":"\([^"]*\)".*/\1/p')"
  SHA256="$(printf '%s' "$RUNTIME" | sed -n 's/.*"sha256":"\([^"]*\)".*/\1/p')"
  VERSION="$(sed -n 's/.*"version":"\([^"]*\)".*/\1/p' "$WORK/payload.json")"
  [ -n "$URL" ] && [ -n "$SHA256" ] || fail "the release feed answered with something unexpected."
  echo "Downloading Ri $VERSION..."
  curl -fL --proto '=https' --tlsv1.2 --progress-bar -o "$WORK/runtime.tar.gz" "$URL" || fail "the download didn't finish. Check your connection and try again."
  [ "$(sha256 "$WORK/runtime.tar.gz")" = "$SHA256" ] || fail "the download doesn't match its checksum."
  mkdir "$WORK/release"
  tar -xzf "$WORK/runtime.tar.gz" -C "$WORK/release" || fail "the download couldn't be unpacked."
  printf '%s' "$ROOT_KEY_BASE64" | base64 --decode > "$WORK/root.pem" 2>/dev/null || printf '%s' "$ROOT_KEY_BASE64" | base64 -D > "$WORK/root.pem"
  echo "Checking the signature and every file..."
  RI_RUNTIME_REPO="$WORK/release/server" "$WORK/release/node/bin/node" "$WORK/release/server/dist/cli/index.mjs" service install-release "$WORK/release" --envelope "$WORK/release.json" --keys "$WORK/keys.json" --root-key "$WORK/root.pem" --channel "$CHANNEL" || fail "the release didn't pass its checks."
  BIN="${RI_COMMAND_DIR:-$HOME/.local/bin}"
  echo
  ri_terminal "$BIN/ri" || :
  # A new terminal reads the change. This one needs the full path unless its PATH already finds the launcher.
  RUN=ri
  [ "$(command -v ri 2>/dev/null || :)" = "$BIN/ri" ] || RUN="$(ri_shown "$BIN/ri")"
  echo
  echo "Ri $VERSION is installed."
  echo "Run: $RUN start"
}

fail() { echo "Ri wasn't installed: $1" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "this script needs $1."; }

# --- `ri` in a new terminal (docs/always-on-spec.md section 9.1) ---
# macOS ships Ruby's documentation tool as /usr/bin/ri, and Ruby version managers put
# their own `ri` first on the PATH, often again at every prompt. So the install opens a
# test terminal of the person's shell to see which `ri` it runs, and if that isn't the
# launcher, puts two lines at the end of the shell's startup file: one puts the
# launcher's folder first on the PATH, and one defines `ri` as a shell function, which
# a shell runs ahead of anything on the PATH. Every line ends with "# Added by Ri".
# These rules, probes and lines are the same as src/lib/service/terminal-command.ts,
# which "Add `ri` to Terminal" and `ri doctor` use, and its tests run these functions.

RI_MARK='# Added by Ri'

# What a shell prints about `ri` after running its prompt hooks, as a terminal does
# before the first command (mise and chruby change the PATH in those hooks).
ri_probe_script() {
  case $1 in
    zsh) printf '%s' '{ (( ${+functions[precmd]} )) && precmd; for f in "${precmd_functions[@]:-}"; do "$f"; done; (( ${+functions[preexec]} )) && preexec ri ri ri; for f in "${preexec_functions[@]:-}"; do "$f" ri ri ri; done; } </dev/null >/dev/null 2>&1; { print -r -- "kind=${$(whence -w ri)#ri: }"; print -r -- "path=$(whence -p ri)"; print -r -- "config=${ZDOTDIR:-$HOME}"; print -r -- "definition:"; whence -c ri; } >"$RI_PROBE_OUT" 2>/dev/null' ;;
    bash) printf '%s' 'if [ -n "${PROMPT_COMMAND:-}" ]; then for c in "${PROMPT_COMMAND[@]}"; do eval "$c"; done; fi </dev/null >/dev/null 2>&1; { printf "kind=%s\n" "$(type -t ri)"; printf "path=%s\n" "$(type -P ri)"; printf "config=\n"; printf "definition:\n"; type ri; } >"$RI_PROBE_OUT" 2>/dev/null' ;;
    fish) printf '%s' 'begin; emit fish_prompt; emit fish_preexec ri; end </dev/null >/dev/null 2>&1; begin; printf "kind=%s\n" (type -t ri 2>/dev/null); printf "path=%s\n" (command -v ri 2>/dev/null); printf "config=%s\n" $__fish_config_dir; printf "definition:\n"; type ri 2>/dev/null; end >$RI_PROBE_OUT' ;;
  esac
}

# The ways a new terminal starts this shell: macOS terminals open login shells, Linux
# desktop terminals don't, and an SSH session does.
ri_probe_flags() {
  case $1 in
    bash) if [ "$(uname -s)" = Darwin ]; then echo '-i -l'; else printf '%s\n' '-i -l' '-i'; fi ;;
    *) echo '-i -l' ;;
  esac
}

# Run the shell $1 ($2 its kind) with flags $3 as a new terminal would, from the home
# folder with the system PATH, and write its answer to $4. Nothing it prints reaches
# this terminal: no input, output to /dev/null, its own session so it can't open
# /dev/tty, and killed with everything it started after RI_PROBE_SECONDS (macOS has
# no `timeout`).
ri_probe() (
  rm -f "$4"
  if [ "$(uname -s)" = Darwin ]; then ri_base=/usr/bin:/bin:/usr/sbin:/sbin; else ri_base=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin; fi
  ri_user="${USER:-$(id -un 2>/dev/null || :)}"
  ri_term="${TERM:-}"
  case $ri_term in ''|dumb) ri_term=xterm-256color ;; esac
  cd "$HOME" 2>/dev/null || :
  # shellcheck disable=SC2086 # the flags are words
  ri_detach env -i HOME="$HOME" USER="$ri_user" LOGNAME="${LOGNAME:-$ri_user}" SHELL="$1" TERM="$ri_term" PATH="$ri_base" \
    ${LANG:+"LANG=$LANG"} ${LC_ALL:+"LC_ALL=$LC_ALL"} ${LC_CTYPE:+"LC_CTYPE=$LC_CTYPE"} ${TMPDIR:+"TMPDIR=$TMPDIR"} \
    ${XDG_CONFIG_HOME:+"XDG_CONFIG_HOME=$XDG_CONFIG_HOME"} ${ZDOTDIR:+"ZDOTDIR=$ZDOTDIR"} RI_PROBE_OUT="$4" \
    "$1" $3 -c "$(ri_probe_script "$2")" </dev/null >/dev/null 2>&1 &
  ri_pid=$!
  ri_deadline=$(( $(date +%s) + ${RI_PROBE_SECONDS:-10} ))
  while kill -0 "$ri_pid" 2>/dev/null; do
    if [ "$(date +%s)" -ge "$ri_deadline" ]; then kill -KILL -"$ri_pid" 2>/dev/null || kill -KILL "$ri_pid" 2>/dev/null || :; break; fi
    sleep 0.1 2>/dev/null || sleep 1
  done
  wait "$ri_pid" 2>/dev/null || :
) 2>/dev/null

ri_detach() {
  if command -v setsid >/dev/null 2>&1; then exec setsid "$@"
  elif command -v perl >/dev/null 2>&1; then exec perl -e 'use POSIX (); POSIX::setsid(); exec @ARGV or exit 127' "$@"
  else exec "$@"; fi
}

# Read a probe's answer $1: sets ri_status (ri, other, missing or unknown), ri_found
# (what runs instead) and ri_config (where zsh or fish keeps its startup files).
ri_judge() {
  ri_status=unknown
  [ -f "$1" ] && grep -q '^kind=' "$1" || return 0
  ri_kind=$(sed -n 's/^kind=//p' "$1" | head -n 1)
  ri_path=$(sed -n 's/^path=//p' "$1" | head -n 1)
  ri_config=$(sed -n 's/^config=//p' "$1" | head -n 1)
  case $ri_kind in
    file|command|hashed)
      if [ "$ri_path" = "$ri_launcher" ] || [ "$ri_path" -ef "$ri_launcher" ]; then ri_status=ri; else ri_status=other; ri_found=$ri_path; fi ;;
    function|alias)
      if sed '1,/^definition:$/d' "$1" | grep -F -e "$ri_launcher" -e "$ri_expr/ri" >/dev/null; then ri_status=ri; else ri_status=other; ri_found="a shell $ri_kind named ri"; fi ;;
    none|'') ri_status=missing ;;
    *) ri_status=other; ri_found="the shell's own ri" ;;
  esac
}

# Every way a new terminal starts the shell: Ri only if all of them run Ri. The worst
# answer wins: another program, then nothing at all, then no answer.
ri_rank() { case $1 in other) echo 3 ;; missing) echo 2 ;; unknown) echo 1 ;; *) echo 0 ;; esac; }
ri_check() {
  ri_answer=unknown ri_answer_found= ri_answer_config=
  case $ri_family in zsh|bash|fish) command -v "$ri_shell" >/dev/null 2>&1 && ri_answer= ;; esac
  if [ -z "$ri_answer" ]; then
    ri_flags_list=$(ri_probe_flags "$ri_family")
    while IFS= read -r ri_flags; do
      ri_found= ri_config=
      ri_probe "$ri_shell" "$ri_family" "$ri_flags" "$WORK/probe"
      ri_judge "$WORK/probe"
      ri_answer_config=${ri_answer_config:-$ri_config}
      if [ -z "$ri_answer" ] || [ "$(ri_rank "$ri_status")" -gt "$(ri_rank "$ri_answer")" ]; then ri_answer=$ri_status ri_answer_found=$ri_found; fi
    done <<EOF
$ri_flags_list
EOF
  fi
  ri_status=$ri_answer ri_found=$ri_answer_found ri_config=$ri_answer_config
}

# The two lines, in syntax $1 (sh for zsh and bash, posix for ~/.profile, or fish), for
# the folder $2 as written in the file ("$HOME/.local/bin").
ri_lines() {
  case $1 in
    fish) printf '%s\n' "set -gx PATH \"$2\" \$PATH $RI_MARK" \
      "function ri; if test -x \"$2/ri\"; \"$2/ri\" \$argv; else; command ri \$argv; end; end $RI_MARK" ;;
    sh) printf '%s\n' "export PATH=\"$2:\$PATH\" $RI_MARK" \
      "function ri { if [ -x \"$2/ri\" ]; then \"$2/ri\" \"\$@\"; else command ri \"\$@\"; fi; } $RI_MARK" ;;
    posix) printf '%s\n' "export PATH=\"$2:\$PATH\" $RI_MARK" \
      "ri() { if [ -x \"$2/ri\" ]; then \"$2/ri\" \"\$@\"; else command ri \"\$@\"; fi; } $RI_MARK" ;;
  esac
}

# Put the lines at the end of file $1 in syntax $2, moving any of Ri's lines already
# there and leaving every other line as it is. Returns 0 when the file changed, 1 when
# it already ended with them, and 2 when it can't be changed.
ri_write() {
  ri_new="$WORK/terminal-file"
  if [ -e "$1" ] || [ -L "$1" ]; then
    { [ -f "$1" ] && [ -r "$1" ] && [ -w "$1" ]; } || return 2
    ri_grep=0
    grep -v '^[^#].* # Added by Ri$' "$1" > "$ri_new" || ri_grep=$?
    [ "$ri_grep" -le 1 ] || return 2
  else
    mkdir -p "$(dirname "$1")" || return 2
    : > "$ri_new"
  fi
  ri_lines "$2" "$ri_expr" >> "$ri_new"
  if [ -f "$1" ] && cmp -s "$ri_new" "$1"; then return 1; fi
  # Written in place, so a startup file that is a link into a dotfiles folder stays one.
  cat "$ri_new" > "$1" || return 2
}

# The files a new terminal of this shell reads last, each with its syntax.
ri_files() {
  case $ri_family in
    zsh) echo "sh ${ri_config:-${ZDOTDIR:-$HOME}}/.zshrc" ;;
    bash)
      # Linux desktop terminals read ~/.bashrc. Mac terminals open login shells, which don't.
      if [ -f "$HOME/.bashrc" ] || [ "$(uname -s)" != Darwin ]; then echo "sh $HOME/.bashrc"; fi
      # Bash reads only the first of these at login, so a new one would hide the others.
      if [ -f "$HOME/.bash_profile" ]; then echo "sh $HOME/.bash_profile"
      elif [ -f "$HOME/.bash_login" ]; then echo "sh $HOME/.bash_login"
      elif [ -f "$HOME/.profile" ]; then echo "posix $HOME/.profile"
      else echo "sh $HOME/.bash_profile"; fi ;;
    fish) echo "fish ${ri_config:-${XDG_CONFIG_HOME:-$HOME/.config}/fish}/config.fish" ;;
    posix) echo "posix $HOME/.profile" ;;
  esac
}

ri_shown() { case $1 in "$HOME"/*) printf '~/%s' "${1#"$HOME"/}" ;; *) printf '%s' "$1" ;; esac; }
# What runs instead of Ri, named for a person: usually Ruby's documentation tool.
ri_describe() {
  case $1 in
    /usr/bin/ri|*ruby*|*rbenv*|*asdf*|*mise*|*rubies*) printf "Ruby's ri (%s)" "$(ri_shown "$1")" ;;
    *) ri_shown "$1" ;;
  esac
}

# Make `ri` in a new terminal run the launcher $1, and say plainly what changed.
ri_terminal() {
  ri_launcher=$1
  ri_folder=$(dirname "$ri_launcher")
  ri_shell=${SHELL:-}
  if [ -z "$ri_shell" ]; then if [ "$(uname -s)" = Darwin ]; then ri_shell=/bin/zsh; else ri_shell=/bin/bash; fi; fi
  ri_name=$(basename "$ri_shell")
  case $ri_name in
    zsh|bash|fish) ri_family=$ri_name ;;
    sh|dash|ash|ksh|ksh93|mksh|yash|busybox) ri_family=posix ;;
    *) echo "Ri can't set up $ri_name terminals. Put $(ri_shown "$ri_folder") first on its PATH, or run $(ri_shown "$ri_launcher")."; return 0 ;;
  esac
  case $ri_folder in
    *[\"\$\`\\]*) echo "Ri can't write $ri_folder into a startup file. Put it first on your PATH, or run $ri_launcher."; return 0 ;;
    "$HOME"/*) ri_expr="\$HOME/${ri_folder#"$HOME"/}" ;;
    *) ri_expr=$ri_folder ;;
  esac
  ri_check
  [ "$ri_status" = ri ] && return 0
  case $ri_status in
    other) ri_before="In a new $ri_name terminal, \`ri\` ran $(ri_describe "$ri_found") instead of Ri. " ;;
    missing) ri_before="A new $ri_name terminal didn't find \`ri\`. " ;;
    *) ri_before= ;;
  esac
  ri_changed= ri_failed= ri_targets=
  ri_list=$(ri_files)
  while read -r ri_syntax ri_file; do
    ri_targets="${ri_targets:+$ri_targets and }$(ri_shown "$ri_file")"
    ri_rc=0
    ri_write "$ri_file" "$ri_syntax" || ri_rc=$?
    if [ "$ri_rc" -eq 0 ]; then ri_changed="${ri_changed:+$ri_changed and }$(ri_shown "$ri_file")"
    elif [ "$ri_rc" -eq 2 ]; then ri_failed="${ri_failed:+$ri_failed and }$(ri_shown "$ri_file")"; fi
  done <<EOF
$ri_list
EOF
  if [ -n "$ri_failed" ]; then
    echo "${ri_before}Ri couldn't change $ri_failed. Put $(ri_shown "$ri_folder") first on your PATH, or run $(ri_shown "$ri_launcher")."
    return 0
  fi
  if [ -n "$ri_changed" ]; then ri_put="Put 2 lines marked \"$RI_MARK\" at the end of $ri_changed"
  else ri_put="The lines marked \"$RI_MARK\" are already at the end of $ri_targets"; fi
  ri_check
  case $ri_status in
    ri) echo "${ri_before}${ri_put}, so \`ri\` runs Ri. Open a new terminal window to use it." ;;
    other)
      if [ "$ri_found" = "a shell alias named ri" ]; then ri_why="A shell expands an alias before anything else, so remove that alias to use Ri as \`ri\`, or run $(ri_shown "$ri_launcher")."
      else ri_why="Something after those lines takes \`ri\` over. $(ri_shown "$ri_launcher") always runs Ri."; fi
      echo "${ri_before}${ri_put}, but a new terminal still runs $(ri_describe "$ri_found"). $ri_why" ;;
    *) if [ "$ri_family" = posix ]; then ri_unchecked=; else ri_unchecked=" Ri couldn't open a test terminal to check."; fi
      echo "${ri_before}${ri_put}, so \`ri\` runs Ri.${ri_unchecked} Open a new terminal window to use it." ;;
  esac
}

main "$@"
