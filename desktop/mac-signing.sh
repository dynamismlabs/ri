#!/usr/bin/env bash
# Developer ID signing and notarization for the Mac app in CI (docs/publishing.md).
#
#   bash desktop/mac-signing.sh setup            Import the certificate and write the API key
#   bash desktop/mac-signing.sh verify <dmg or app>...  Check what people download
#   bash desktop/mac-signing.sh cleanup          Remove both
#
# setup reads the secrets CSC_LINK (the .p12, base64), CSC_KEY_PASSWORD, APPLE_API_KEY
# (the .p8 file's contents), APPLE_API_KEY_ID and APPLE_API_ISSUER, and the variables
# APPLE_TEAM_ID and CSC_NAME. With none of them, the build stays ad-hoc signed. With only
# some, it stops, since a release that quietly lost its signature is worse than none.
# It writes the step outputs identity, keychain and api_key for the build step.
set -euo pipefail

KEYCHAIN="${RUNNER_TEMP:?Run this in GitHub Actions}/ri-signing.keychain-db"
KEY_DIR="$RUNNER_TEMP/apple-api-key"
NAMES=(CSC_LINK CSC_KEY_PASSWORD APPLE_API_KEY APPLE_API_KEY_ID APPLE_API_ISSUER APPLE_TEAM_ID CSC_NAME)

fail() { echo "::error::$1" >&2; exit 1; }

setup() {
  local present=() missing=()
  for name in "${NAMES[@]}"; do
    if [ -n "${!name:-}" ]; then present+=("$name"); else missing+=("$name"); fi
  done
  if [ "${#present[@]}" -eq 0 ]; then
    echo "No Developer ID is set up, so this Mac build is ad-hoc signed and not notarized."
    return
  fi
  [ "${#missing[@]}" -eq 0 ] || fail "Signing the Mac app needs all of ${NAMES[*]}. Missing: ${missing[*]}. Add them, or remove the others to build ad-hoc signed (docs/publishing.md)."
  case "$CSC_NAME" in
    "Developer ID Application:"*) fail "Set CSC_NAME without \"Developer ID Application:\", as in \"Example Inc. ($APPLE_TEAM_ID)\"." ;;
    *"($APPLE_TEAM_ID)") ;;
    *) fail "CSC_NAME should end with the Team ID in parentheses, as in \"Example Inc. ($APPLE_TEAM_ID)\"." ;;
  esac

  # A keychain of its own, unlocked for this job, searched first. codesign finds the
  # identity there for Ri's native files, and electron-builder through CSC_KEYCHAIN.
  local password certificate
  password="$(openssl rand -hex 24)"
  certificate="$RUNNER_TEMP/developer-id.p12"
  printf '%s' "$CSC_LINK" | tr -d '\r\n ' | base64 --decode > "$certificate"
  security create-keychain -p "$password" "$KEYCHAIN"
  security set-keychain-settings -lut 21600 "$KEYCHAIN"
  security unlock-keychain -p "$password" "$KEYCHAIN"
  security import "$certificate" -k "$KEYCHAIN" -f pkcs12 -P "$CSC_KEY_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security >/dev/null
  rm -f "$certificate"
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$password" "$KEYCHAIN" >/dev/null
  # Apple's intermediate certificate, in case the .p12 was exported without it. It only
  # helps build the chain to Apple's root, so a failed download is not an error here.
  if curl -fsSL --proto '=https' -o "$RUNNER_TEMP/DeveloperIDG2CA.cer" https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer; then
    security import "$RUNNER_TEMP/DeveloperIDG2CA.cer" -k "$KEYCHAIN" >/dev/null 2>&1 || true
  fi
  local others=()
  while IFS= read -r line; do others+=("$(echo "$line" | sed -e 's/^[[:space:]]*"//' -e 's/"[[:space:]]*$//')"); done < <(security list-keychains -d user)
  security list-keychains -d user -s "$KEYCHAIN" "${others[@]}"
  security find-identity -v -p codesigning "$KEYCHAIN" | grep -F "Developer ID Application: $CSC_NAME" >/dev/null \
    || fail "The certificate in CSC_LINK is not the Developer ID Application identity \"$CSC_NAME\"."

  # electron-builder notarizes with the key's path.
  mkdir -p -m 700 "$KEY_DIR"
  local key="$KEY_DIR/AuthKey_$APPLE_API_KEY_ID.p8"
  printf '%s\n' "$APPLE_API_KEY" > "$key"
  chmod 600 "$key"
  grep -q -- '-----BEGIN PRIVATE KEY-----' "$key" || fail "APPLE_API_KEY should hold the .p8 file's contents, starting with -----BEGIN PRIVATE KEY-----."

  {
    echo "identity=$CSC_NAME"
    echo "keychain=$KEYCHAIN"
    echo "api_key=$key"
  } >> "$GITHUB_OUTPUT"
  echo "Signing as Developer ID Application: $CSC_NAME, and notarizing with API key $APPLE_API_KEY_ID."
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
  rm -rf "$KEY_DIR" "$RUNNER_TEMP/developer-id.p12"
}

case "${1:-}" in
  setup) setup ;;
  verify) shift; verify "$@" ;;
  cleanup) cleanup ;;
  *) fail "Use setup, verify or cleanup." ;;
esac
