#!/usr/bin/env bash
# Developer ID signing and notarization for the Mac app in CI (docs/publishing.md).
#
#   bash desktop/mac-signing.sh setup                   Import the certificate and check it all, for a build
#   bash desktop/mac-signing.sh check                   The same checks, then remove everything. Builds nothing
#   bash desktop/mac-signing.sh verify <dmg or app>...  Check what people download
#   bash desktop/mac-signing.sh cleanup                 Remove the keychain and the API key
#
# It reads these repository secrets:
#   APPLE_CERTIFICATE           the Developer ID Application certificate and its private key, a .p12 in base64
#   APPLE_CERTIFICATE_PASSWORD  the .p12's password
#   APPLE_TEAM_ID               the team the certificate belongs to
#   KEYCHAIN_PASSWORD           optional, the temporary keychain's password. Made up when empty
# and one way to notarize, the Apple ID when both are set:
#   APPLE_ID and APPLE_APP_SPECIFIC_PASSWORD               an Apple ID in the team
#   APPLE_API_KEY, APPLE_API_KEY_ID and APPLE_API_ISSUER   an App Store Connect API key (the .p8's contents)
# With none of them, the build stays ad-hoc signed. With only some, it stops, since a
# release that quietly lost its signature is worse than none. The signing identity comes
# from the certificate itself, checked to be a Developer ID Application identity in
# APPLE_TEAM_ID. setup also signs in to Apple's notary service, so a wrong password fails
# in seconds rather than after the build. It writes the step outputs identity, keychain,
# notary (apple-id or api-key) and api_key for the build step.
#
# Nothing here prints a secret. GitHub hides each secret's value in the log, and the one
# value made here, a keychain password, is hidden the same way.
set -euo pipefail

KEYCHAIN="${RUNNER_TEMP:?Run this in GitHub Actions}/ri-signing.keychain-db"
KEY_DIR="$RUNNER_TEMP/apple-api-key"
CERTIFICATE="$RUNNER_TEMP/developer-id.p12"
NOTARY_ERRORS="$RUNNER_TEMP/notarytool.err"
PREFIX='Developer ID Application: '
SIGNING_NAMES='APPLE_CERTIFICATE APPLE_CERTIFICATE_PASSWORD APPLE_TEAM_ID'
APPLE_ID_NAMES='APPLE_ID APPLE_APP_SPECIFIC_PASSWORD'
API_KEY_NAMES='APPLE_API_KEY APPLE_API_KEY_ID APPLE_API_ISSUER'
# Apple's intermediate certificates, in case the .p12 was exported without one. They only
# help build the chain to Apple's root, which macOS already trusts.
INTERMEDIATES='DeveloperIDG2CA DeveloperIDCA'

error() { echo "::error::$1" >&2; }
fail() { error "$1"; exit 1; }
# The names given that hold a value, or that don't, each followed by a space.
present() { local name; for name in "$@"; do if [ -n "${!name:-}" ]; then printf '%s ' "$name"; fi; done; }
absent() { local name; for name in "$@"; do if [ -z "${!name:-}" ]; then printf '%s ' "$name"; fi; done; }
lines() { printf '%s' "$1" | tr '\n' ';' | sed -e 's/;$//' -e 's/;/; /g'; }

# ANY lists the Apple secrets that are set and MISSING what a complete set still needs.
# NOTARY (apple-id or api-key) is how the build will notarize, and NOTARY_NEEDS what
# that way still needs.
read_secrets() {
  ANY="$(present $SIGNING_NAMES $APPLE_ID_NAMES $API_KEY_NAMES)"
  if [ -n "$(present $APPLE_ID_NAMES)" ]; then
    NOTARY=apple-id
    NOTARY_LABEL='the Apple ID in APPLE_ID'
    NOTARY_NEEDS="$(absent $APPLE_ID_NAMES APPLE_TEAM_ID)"
  elif [ -n "$(present $API_KEY_NAMES)" ]; then
    NOTARY=api-key
    NOTARY_LABEL='the App Store Connect API key in APPLE_API_KEY'
    NOTARY_NEEDS="$(absent $API_KEY_NAMES)"
  else
    NOTARY=
    NOTARY_LABEL=
    NOTARY_NEEDS='APPLE_ID APPLE_APP_SPECIFIC_PASSWORD '
  fi
  MISSING="$(absent $SIGNING_NAMES)"
  MISSING="$MISSING${NOTARY_NEEDS/APPLE_TEAM_ID /}"
  MISSING="${MISSING% }"
  NOTARY_NEEDS="${NOTARY_NEEDS% }"
}

missing_message() {
  echo "Signing the Mac app needs APPLE_CERTIFICATE, APPLE_CERTIFICATE_PASSWORD and APPLE_TEAM_ID, and to notarize, APPLE_ID and APPLE_APP_SPECIFIC_PASSWORD (or an API key in APPLE_API_KEY, APPLE_API_KEY_ID and APPLE_API_ISSUER). Missing: $MISSING. Add them, or remove the others to build ad-hoc signed (docs/publishing.md)."
}

# The certificate, in a keychain of its own, unlocked for this job and searched first.
# codesign finds the identity there for Ri's native files, and electron-builder through
# CSC_KEYCHAIN. IMPORTED says what the keychain took in.
import_certificate() {
  local password="${KEYCHAIN_PASSWORD:-}" encoded output line name others=()
  if [ -z "$password" ]; then
    password="$(openssl rand -hex 24)"
    echo "::add-mask::$password"
  fi
  encoded="$(printf '%s' "$APPLE_CERTIFICATE" | tr -d ' \t\r\n')"
  case "$encoded" in
    *[!A-Za-z0-9+/=]*) ;;
    *) printf '%s' "$encoded" | base64 --decode > "$CERTIFICATE" 2>/dev/null || true ;;
  esac
  if [ ! -s "$CERTIFICATE" ]; then
    rm -f "$CERTIFICATE"
    error "APPLE_CERTIFICATE isn't base64. Set it to the output of: base64 -i DeveloperIDApplication.p12"
    return 1
  fi
  security delete-keychain "$KEYCHAIN" >/dev/null 2>&1 || true
  if ! { security create-keychain -p "$password" "$KEYCHAIN" && security set-keychain-settings -lut 21600 "$KEYCHAIN" && security unlock-keychain -p "$password" "$KEYCHAIN"; }; then
    rm -f "$CERTIFICATE"
    error "This runner couldn't make a keychain to import the certificate into."
    return 1
  fi
  if ! output="$(security import "$CERTIFICATE" -k "$KEYCHAIN" -f pkcs12 -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security 2>&1)"; then
    rm -f "$CERTIFICATE"
    error "APPLE_CERTIFICATE_PASSWORD doesn't open APPLE_CERTIFICATE, or it isn't a .p12 (security: $(lines "$output")). Export the certificate from Keychain Access with its private key, as a .p12, and set both secrets again."
    return 1
  fi
  rm -f "$CERTIFICATE"
  IMPORTED="$(lines "$output")"
  if ! output="$(security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$password" "$KEYCHAIN" 2>&1 >/dev/null)"; then
    error "codesign can't be given the private key in APPLE_CERTIFICATE (security: $(lines "$output")). The .p12 needs the private key, not only the certificate."
    return 1
  fi
  for name in $INTERMEDIATES; do
    if curl -fsSL --proto '=https' -o "$RUNNER_TEMP/$name.cer" "https://www.apple.com/certificateauthority/$name.cer" 2>/dev/null; then
      security import "$RUNNER_TEMP/$name.cer" -k "$KEYCHAIN" >/dev/null 2>&1 || true
    fi
    rm -f "$RUNNER_TEMP/$name.cer"
  done
  while IFS= read -r line; do others+=("$(echo "$line" | sed -e 's/^[[:space:]]*"//' -e 's/"[[:space:]]*$//')"); done < <(security list-keychains -d user)
  if ! security list-keychains -d user -s "$KEYCHAIN" ${others[@]+"${others[@]}"}; then
    error "This runner couldn't search the new keychain."
    return 1
  fi
}

# DEVELOPER_IDS becomes the valid Developer ID Application identities in the certificate,
# one per line. Anything else it holds is named, with why it can't sign.
developer_identities() {
  local listing names name all
  listing="$(security find-identity -v -p codesigning "$KEYCHAIN" 2>&1)" || true
  names="$(printf '%s\n' "$listing" | sed -n 's/^ *[0-9][0-9]*) [0-9A-F]\{40\} "\(.*\)"$/\1/p')"
  if [ -z "$names" ]; then
    # The full list includes identities that can't sign, with Apple's reason.
    all="$(security find-identity -p codesigning "$KEYCHAIN" 2>&1 | sed -n 's/^ *[0-9][0-9]*) [0-9A-F]\{40\} //p' | sort -u)" || true
    error "APPLE_CERTIFICATE holds no identity that can sign${all:+ (it holds $(lines "$all"))}. It needs the Developer ID Application certificate with its private key, not expired or revoked."
    return 1
  fi
  DEVELOPER_IDS=
  while IFS= read -r name; do
    case "$name" in "$PREFIX"*) DEVELOPER_IDS="$DEVELOPER_IDS$name"$'\n' ;; esac
  done <<< "$names"
  DEVELOPER_IDS="${DEVELOPER_IDS%$'\n'}"
  if [ -z "$DEVELOPER_IDS" ]; then
    error "APPLE_CERTIFICATE holds $(lines "$names"), not a Developer ID Application certificate. Create one under Certificates on developer.apple.com (the Account Holder can) and export it with its private key."
    return 1
  fi
}

# IDENTITY becomes the one Developer ID Application identity in APPLE_TEAM_ID, without
# that prefix, since electron-builder adds it.
team_identity() {
  local name matches=''
  if [[ ! "$APPLE_TEAM_ID" =~ ^[A-Z0-9]{10}$ ]]; then
    error "APPLE_TEAM_ID should be just the 10-character Team ID, such as ABCDE12345, with no spaces or line breaks. It's under Membership details on developer.apple.com."
    return 1
  fi
  while IFS= read -r name; do
    case "$name" in *"($APPLE_TEAM_ID)") matches="$matches$name"$'\n' ;; esac
  done <<< "$DEVELOPER_IDS"
  matches="${matches%$'\n'}"
  if [ -z "$matches" ]; then
    error "The certificate in APPLE_CERTIFICATE is $(lines "$DEVELOPER_IDS"), which isn't in the team APPLE_TEAM_ID names. One of the two secrets is for another team."
    return 1
  fi
  case "$matches" in *$'\n'*)
    error "APPLE_CERTIFICATE holds more than one Developer ID Application identity for the team ($(lines "$matches")). Export just one."
    return 1 ;;
  esac
  IDENTITY="${matches#"$PREFIX"}"
}

# EXPIRES becomes the certificate's expiry date, and EXPIRES_SOON says whether that is
# within 30 days. Signed apps keep working after it, but new builds can't be signed.
certificate_expiry() {
  local pem
  if ! pem="$(security find-certificate -c "$PREFIX$IDENTITY" -p "$KEYCHAIN" 2>/dev/null)" || [ -z "$pem" ]; then
    error "The keychain lost the certificate it imported."
    return 1
  fi
  EXPIRES="$(printf '%s\n' "$pem" | openssl x509 -noout -enddate | sed 's/^notAfter=//')"
  EXPIRES_SOON=
  printf '%s\n' "$pem" | openssl x509 -noout -checkend 2592000 >/dev/null || EXPIRES_SOON=1
}

write_api_key() {
  mkdir -p -m 700 "$KEY_DIR"
  API_KEY_FILE="$KEY_DIR/AuthKey_$APPLE_API_KEY_ID.p8"
  printf '%s\n' "$APPLE_API_KEY" > "$API_KEY_FILE"
  chmod 600 "$API_KEY_FILE"
  grep -q -- '-----BEGIN PRIVATE KEY-----' "$API_KEY_FILE" && return
  error "APPLE_API_KEY should hold the .p8 file's contents, starting with -----BEGIN PRIVATE KEY-----."
  return 1
}

# Signs in to Apple's notary service as electron-builder will, and lists past submissions.
# Nothing is submitted. NOTARIZED says how many there were.
check_notary() {
  local output why count
  case "$NOTARY" in
    apple-id) set -- --apple-id "$APPLE_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD" --team-id "$APPLE_TEAM_ID" ;;
    api-key) write_api_key || return 1; set -- --key "$API_KEY_FILE" --key-id "$APPLE_API_KEY_ID" --issuer "$APPLE_API_ISSUER" ;;
  esac
  if ! output="$(xcrun notarytool history "$@" 2>"$NOTARY_ERRORS")"; then
    why="$(lines "$(cat "$NOTARY_ERRORS"; printf '%s' "$output")")"
    case "$NOTARY" in
      apple-id) error "Apple's notary service refused APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID (notarytool: $why). Check the Apple ID is in the team, and make a new app-specific password at account.apple.com if it was revoked." ;;
      api-key) error "Apple's notary service refused APPLE_API_KEY, APPLE_API_KEY_ID and APPLE_API_ISSUER (notarytool: $why). Check the key wasn't revoked and has the Developer role." ;;
    esac
    rm -f "$NOTARY_ERRORS"
    return 1
  fi
  rm -f "$NOTARY_ERRORS"
  count="$(printf '%s\n' "$output" | grep -c '^ *id:' || true)"
  NOTARIZED="signed in, ${count:-0} past submissions listed"
}

setup() {
  read_secrets
  if [ -z "$ANY" ]; then
    echo "No Developer ID is set up, so this Mac build is ad-hoc signed and not notarized."
    return
  fi
  [ -z "$MISSING" ] || fail "$(missing_message)"
  import_certificate || exit 1
  developer_identities || exit 1
  team_identity || exit 1
  certificate_expiry || exit 1
  [ -z "$EXPIRES_SOON" ] || echo "::warning::The Developer ID certificate expires $EXPIRES. Make a new one and update APPLE_CERTIFICATE before then."
  check_notary || exit 1
  {
    echo "identity=$IDENTITY"
    echo "keychain=$KEYCHAIN"
    echo "notary=$NOTARY"
    echo "api_key=${API_KEY_FILE:-}"
  } >> "${GITHUB_OUTPUT:?Run this in GitHub Actions}"
  echo "Signing as $PREFIX$IDENTITY, which expires $EXPIRES, and notarizing with $NOTARY_LABEL ($NOTARIZED)."
}

# One row of check's summary: pass, warn, fail or skip, what was checked, and what was found.
SUMMARY=
FAILED=
row() {
  SUMMARY="$SUMMARY$1|$2|$3"$'\n'
  [ "$1" != fail ] || FAILED=1
}

summarize() {
  local state item detail
  echo
  echo "Apple signing check"
  while IFS='|' read -r state item detail; do
    if [ -n "$state" ]; then printf '  %-5s %-27s %s\n' "$state" "$item" "$detail"; fi
  done <<< "$SUMMARY"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    {
      echo '### Apple signing check'
      echo
      echo '| Result | Check | Found |'
      echo '| --- | --- | --- |'
      while IFS='|' read -r state item detail; do
        if [ -n "$state" ]; then echo "| $state | $item | $detail |"; fi
      done <<< "$SUMMARY"
    } >> "$GITHUB_STEP_SUMMARY"
  fi
}

# Everything setup checks, each item on its own, then the keychain and key are removed.
check() {
  read_secrets
  if [ -z "$ANY" ]; then
    row fail 'Apple secrets' 'none are set'
    error "None of the Apple secrets are set, so there is nothing to check. $(missing_message)"
  elif [ -n "$MISSING" ]; then
    row fail 'Apple secrets' "missing $MISSING"
    error "$(missing_message)"
  else
    row pass 'Apple secrets' "all set, notarizing with $NOTARY_LABEL"
  fi
  if [ -n "$(absent $SIGNING_NAMES)" ]; then
    row skip 'Certificate imported' "needs $(absent $SIGNING_NAMES)"
  elif ! import_certificate; then
    row fail 'Certificate imported' 'see the error above'
  else
    row pass 'Certificate imported' "$IMPORTED"
    if ! developer_identities; then
      row fail 'Developer ID Application' 'see the error above'
    else
      row pass 'Developer ID Application' "$(lines "$DEVELOPER_IDS")"
      if ! team_identity; then
        row fail 'Team is APPLE_TEAM_ID' 'see the error above'
      else
        row pass 'Team is APPLE_TEAM_ID' "$PREFIX$IDENTITY"
        if ! certificate_expiry; then
          row fail 'Expires' 'see the error above'
        elif [ -n "$EXPIRES_SOON" ]; then
          row warn 'Expires' "$EXPIRES, within 30 days"
        else
          row pass 'Expires' "$EXPIRES"
        fi
      fi
    fi
  fi
  if [ -n "$NOTARY_NEEDS" ]; then
    row skip 'Notarization sign-in' "needs $NOTARY_NEEDS"
  elif ! check_notary; then
    row fail 'Notarization sign-in' 'see the error above'
  else
    row pass 'Notarization sign-in' "$NOTARY_LABEL, $NOTARIZED"
  fi
  cleanup
  if [ -e "$KEYCHAIN" ] || [ -e "$KEY_DIR" ]; then row fail 'Keychain removed' "$KEYCHAIN is still there"
  else row pass 'Keychain removed' 'the keychain and any key file are deleted'; fi
  summarize
  if [ -n "$FAILED" ]; then echo "The Apple secrets aren't ready. The errors above say which to fix."; exit 1; fi
  echo "The Apple secrets can sign and notarize the Mac app."
}

check_app() {
  local app="$1" team assessment
  [ -d "$app" ] || fail "There is no app at $app."
  codesign --verify --deep --strict --verbose=1 "$app"
  team="$(codesign -dv "$app" 2>&1 | sed -n 's/^TeamIdentifier=//p')"
  [ "$team" = "${APPLE_TEAM_ID:?}" ] || fail "$app is signed by team ${team:-none}, not $APPLE_TEAM_ID."
  # Gatekeeper's own verdict. It must come from the notarization, not an override.
  assessment="$(spctl --assess --type execute --verbose=4 "$app" 2>&1)" || { echo "$assessment"; fail "Gatekeeper rejects $app."; }
  echo "$assessment"
  case "$assessment" in *"source=Notarized Developer ID"*) ;; *) fail "Gatekeeper doesn't see $app as notarized." ;; esac
  # The ticket is stapled, so it opens offline the first time too.
  xcrun stapler validate "$app"
}

verify() {
  [ "$#" -gt 0 ] || fail "Name the dmg files or apps to check."
  local dmg
  for dmg in "$@"; do
    if [[ "$dmg" == *.app ]]; then
      check_app "$dmg"
      echo "$dmg: signed by $APPLE_TEAM_ID, notarized, stapled and accepted by Gatekeeper."
      continue
    fi
    MOUNT="$(mktemp -d "$RUNNER_TEMP/dmg.XXXXXX")"
    hdiutil attach -nobrowse -readonly -noautoopen -mountpoint "$MOUNT" "$dmg" >/dev/null
    # A failed check exits the script, and the volume still comes off.
    trap 'hdiutil detach -force "$MOUNT" >/dev/null 2>&1 || true' EXIT
    check_app "$MOUNT/Ri.app"
    hdiutil detach "$MOUNT" >/dev/null || hdiutil detach -force "$MOUNT" >/dev/null
    trap - EXIT
    echo "$dmg: signed by $APPLE_TEAM_ID, notarized, stapled and accepted by Gatekeeper."
  done
}

cleanup() {
  if [ -e "$KEYCHAIN" ]; then security delete-keychain "$KEYCHAIN" || true; fi
  rm -rf "$KEY_DIR" "$CERTIFICATE" "$NOTARY_ERRORS"
}

case "${1:-}" in
  setup) setup ;;
  check) check ;;
  verify) shift; verify "$@" ;;
  cleanup) cleanup ;;
  *) fail "Use setup, check, verify or cleanup." ;;
esac
