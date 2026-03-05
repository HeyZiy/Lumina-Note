#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

failures=0

check_contains() {
  local file="$1"
  local pattern="$2"
  local label="$3"
  if rg -n --fixed-strings "$pattern" "$file" >/dev/null 2>&1; then
    echo "[PASS] $label"
  else
    echo "[FAIL] $label"
    failures=$((failures + 1))
  fi
}

check_not_contains() {
  local file="$1"
  local pattern="$2"
  local label="$3"
  if rg -n --fixed-strings "$pattern" "$file" >/dev/null 2>&1; then
    echo "[FAIL] $label"
    failures=$((failures + 1))
  else
    echo "[PASS] $label"
  fi
}

check_absent_dir() {
  local dir="$1"
  local label="$2"
  if [ -d "$dir" ]; then
    echo "[FAIL] $label"
    failures=$((failures + 1))
  else
    echo "[PASS] $label"
  fi
}

check_not_contains "src-tauri/src/agent/commands.rs" "langgraph" "agent commands no longer reference langgraph"
check_contains "src-tauri/src/agent/commands.rs" "use crate::agent::forge_loop::{" "agent commands use forge loop"
check_not_contains "src-tauri/src/agent/deep_research/builder.rs" "crate::langgraph" "deep research builder has no crate::langgraph refs"
check_contains "src-tauri/src/agent/deep_research/builder.rs" "use forge::runtime::graph::StateGraph;" "deep research builder uses forge StateGraph"
check_not_contains "src-tauri/src/agent/types.rs" "LangGraphState" "agent GraphState is not bound to langgraph trait"
check_not_contains "src-tauri/src/lib.rs" "pub mod langgraph;" "lib no longer exports langgraph module"
check_not_contains "src-tauri/src/main.rs" "mod langgraph;" "main no longer loads langgraph module"
check_absent_dir "src-tauri/src/langgraph" "legacy langgraph module directory removed"

if [ "$failures" -gt 0 ]; then
  echo "\nForge runtime verification failed with $failures issue(s)."
  exit 1
fi

echo "\nForge runtime verification passed."
