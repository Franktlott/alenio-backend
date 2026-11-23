#!/bin/bash
# Alenio's Duo status column is part of the window only when the app is
# compiled with the iOS 27.2 SDK or newer. Older SDKs leave that column black.
set -euo pipefail

FLOOR_MAJOR=27
FLOOR_MINOR=2

version_ok() {
  local ver="$1"
  local major minor
  [[ "$ver" =~ ^[0-9]+(\.[0-9]+)? ]] || return 1
  major=${ver%%.*}
  minor=${ver#*.}
  minor=${minor%%.*}
  [[ "$minor" =~ ^[0-9]+$ ]] || minor=0
  if (( major > FLOOR_MAJOR )); then
    return 0
  fi
  if (( major == FLOOR_MAJOR && minor >= FLOOR_MINOR )); then
    return 0
  fi
  return 1
}

version_newer() {
  local left="$1"
  local right="$2"
  local left_major left_minor right_major right_minor
  left_major=${left%%.*}
  left_minor=${left#*.}
  left_minor=${left_minor%%.*}
  right_major=${right%%.*}
  right_minor=${right#*.}
  right_minor=${right_minor%%.*}
  [[ "$left_minor" =~ ^[0-9]+$ ]] || left_minor=0
  [[ "$right_minor" =~ ^[0-9]+$ ]] || right_minor=0
  if (( left_major > right_major )); then
    return 0
  fi
  if (( left_major == right_major && left_minor > right_minor )); then
    return 0
  fi
  return 1
}

xcode_version() {
  local developer_dir="$1"
  "$developer_dir/usr/bin/xcodebuild" -version 2>/dev/null | awk 'NR==1 { print $2 }'
}

if [[ "${1:-}" == "--check" ]]; then
  if ! version_ok "${SDK_VERSION:-}"; then
    echo "error: Alenio requires the iOS ${FLOOR_MAJOR}.${FLOOR_MINOR} SDK or later so the Duo status column is inside the window. This build is using SDK ${SDK_VERSION:-unknown} from ${DEVELOPER_DIR:-the selected Xcode}." >&2
    exit 1
  fi
  exit 0
fi

if [[ "${1:-}" != "--select" ]]; then
  echo "usage: require-ios-sdk.sh --check | --select" >&2
  exit 2
fi

best_dir=""
best_ver=""
shopt -s nullglob
candidates=(
  /Applications/Xcode.app
  /Applications/Xcode-*.app
  "$HOME"/Downloads/Xcode.app
  "$HOME"/Downloads/Xcode-*.app
)
for app in "${candidates[@]}"; do
  developer_dir="$app/Contents/Developer"
  [[ -x "$developer_dir/usr/bin/xcodebuild" ]] || continue
  ver="$(xcode_version "$developer_dir" || true)"
  version_ok "$ver" || continue
  if [[ -z "$best_ver" ]] || version_newer "$ver" "$best_ver"; then
    best_ver="$ver"
    best_dir="$developer_dir"
  fi
done

if [[ -z "$best_dir" ]]; then
  echo "error: Alenio requires Xcode ${FLOOR_MAJOR}.${FLOOR_MINOR} or later. None of the installed Xcode apps qualify." >&2
  exit 1
fi

printf '%s\n' "$best_dir"
