#!/usr/bin/env bash
# Detect macos-private-api leaked into the global [dependencies] section.
# This feature must only live under [target.'cfg(target_os = "macos")'.dependencies].
# See CLAUDE.md "已知陷阱" for context.

set -euo pipefail

CARGO_TOML="${1:-src-tauri/Cargo.toml}"

if awk '/^\[dependencies\]$/{f=1; next} /^\[/{f=0} f' "$CARGO_TOML" | grep -q 'macos-private-api'; then
  echo "ERROR: macos-private-api found in global [dependencies] of $CARGO_TOML"
  echo "This feature must only appear under [target.'cfg(target_os = \"macos\")'.dependencies]."
  echo "rust-analyzer on macOS likely merged it — please revert the change."
  exit 1
fi
