#!/usr/bin/env bash

################################################################################
# A11Y Tool Wrapper for Anthony
#
# Standalone shell wrapper for a11y-agent that can be called by Anthony
# as a standalone tool (alternative to MCP server).
#
# Usage:
#   a11y-tool.sh scan <url-or-file>
#   a11y-tool.sh scan --voice <url-or-file>
#   a11y-tool.sh fix <url-or-file>
#   a11y-tool.sh interactive <url-or-file>
#
# Environment Variables:
#   A11Y_AGENT_PATH - Path to a11y-agent installation (default: ~/dev/1-workspace/a11y-agent)
#   ANTHROPIC_API_KEY - Claude API key for fix suggestions
################################################################################

set -euo pipefail

# --- Configuration ---

A11Y_AGENT_PATH="${A11Y_AGENT_PATH:-$HOME/dev/1-workspace/a11y-agent}"
SCAN_SCRIPT="$A11Y_AGENT_PATH/src/scan.js"

# --- Helper Functions ---

die() {
  echo "ERROR: $*" >&2
  exit 1
}

usage() {
  cat <<EOF
Usage: $(basename "$0") <command> [options] <target>

Commands:
  scan <target>              Scan URL/file for accessibility violations
  fix <target>               Scan + generate AI fix suggestions
  interactive <target>       Start interactive conversation mode
  explain <violation-id>     Explain a specific violation from last scan

Options:
  --voice                    Enable text-to-speech output
  --rate <wpm>              Speech rate (default: 175)
  --json                     Output raw JSON

Examples:
  $(basename "$0") scan https://example.com
  $(basename "$0") scan --voice /path/to/page.html
  $(basename "$0") fix --voice https://example.com
  $(basename "$0") interactive https://example.com

EOF
  exit 1
}

# --- Validation ---

[[ ! -f "$SCAN_SCRIPT" ]] && die "a11y-agent not found at $A11Y_AGENT_PATH"
[[ $# -lt 1 ]] && usage

# --- Parse Arguments ---

COMMAND="$1"
shift

ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --voice)
      ARGS+=("--voice")
      shift
      ;;
    --rate)
      ARGS+=("--rate" "$2")
      shift 2
      ;;
    --json)
      ARGS+=("--json")
      shift
      ;;
    -*)
      die "Unknown option: $1"
      ;;
    *)
      TARGET="$1"
      shift
      ;;
  esac
done

# --- Execute Command ---

case "$COMMAND" in
  scan)
    [[ -z "${TARGET:-}" ]] && die "Target URL/file required"

    # Determine if target is URL or file
    if [[ "$TARGET" =~ ^https?:// ]]; then
      node "$SCAN_SCRIPT" --url "$TARGET" "${ARGS[@]}"
    else
      node "$SCAN_SCRIPT" --file "$TARGET" "${ARGS[@]}"
    fi
    ;;

  fix)
    [[ -z "${TARGET:-}" ]] && die "Target URL/file required"

    if [[ "$TARGET" =~ ^https?:// ]]; then
      node "$SCAN_SCRIPT" --url "$TARGET" --fix "${ARGS[@]}"
    else
      node "$SCAN_SCRIPT" --file "$TARGET" --fix "${ARGS[@]}"
    fi
    ;;

  interactive)
    [[ -z "${TARGET:-}" ]] && die "Target URL/file required"

    if [[ "$TARGET" =~ ^https?:// ]]; then
      node "$SCAN_SCRIPT" --url "$TARGET" --interactive --fix "${ARGS[@]}"
    else
      node "$SCAN_SCRIPT" --file "$TARGET" --interactive --fix "${ARGS[@]}"
    fi
    ;;

  explain)
    [[ -z "${TARGET:-}" ]] && die "Violation ID required"
    echo "Explain functionality requires MCP server mode."
    echo "Use: node $A11Y_AGENT_PATH/anthony-integration/a11y-mcp-server.js"
    exit 1
    ;;

  *)
    die "Unknown command: $COMMAND"
    ;;
esac
