#!/bin/bash
# Run the iOS app with the newest Xcode that meets the SDK floor.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
developer_dir="$("$root/scripts/require-ios-sdk.sh" --select)"
export DEVELOPER_DIR="$developer_dir"
cd "$root"
exec npx expo run:ios "$@"
