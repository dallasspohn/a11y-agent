#!/usr/bin/env bash

################################################################################
# Anthony Integration Installer for A11Y Agent
#
# Automates the installation and configuration of a11y-agent integration
# with Anthony voice control system.
#
# Usage:
#   ./install.sh [--anthony-path PATH] [--dry-run]
#
# Options:
#   --anthony-path PATH   Path to Anthony installation (default: ~/anthony)
#   --dry-run            Show what would be done without making changes
#   --help               Show this help message
################################################################################

set -euo pipefail

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# --- Configuration ---
ANTHONY_PATH="$HOME/anthony"
DRY_RUN=false
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
A11Y_AGENT_PATH="$(dirname "$SCRIPT_DIR")"

# --- Helper Functions ---

log_info() {
  echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $*"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $*"
}

die() {
  log_error "$*"
  exit 1
}

check_command() {
  command -v "$1" &>/dev/null || die "$1 is required but not installed. Please install it first."
}

# --- Parse Arguments ---

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Install a11y-agent integration with Anthony voice control system.

Options:
  --anthony-path PATH   Path to Anthony installation (default: ~/anthony)
  --dry-run            Show what would be done without making changes
  --help               Show this help message

Examples:
  $(basename "$0")
  $(basename "$0") --anthony-path /opt/anthony
  $(basename "$0") --dry-run

EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --anthony-path)
      ANTHONY_PATH="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --help)
      usage
      ;;
    *)
      die "Unknown option: $1"
      ;;
  esac
done

# --- Validation ---

log_info "Validating installation prerequisites..."

# Check required commands
check_command node
check_command npm
check_command python3

# Check Anthony installation
if [[ ! -d "$ANTHONY_PATH" ]]; then
  die "Anthony not found at $ANTHONY_PATH. Install Anthony first or specify correct path with --anthony-path"
fi

if [[ ! -d "$ANTHONY_PATH/commands" ]]; then
  die "Anthony commands directory not found at $ANTHONY_PATH/commands. Invalid Anthony installation?"
fi

# Check a11y-agent installation
if [[ ! -f "$A11Y_AGENT_PATH/package.json" ]]; then
  die "a11y-agent package.json not found. Run this script from anthony-integration/ directory"
fi

log_success "Prerequisites validated"

# --- Environment Checks ---

log_info "Checking environment configuration..."

if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  log_warning "ANTHROPIC_API_KEY not set. Fix suggestions will not work."
  log_warning "Set it with: export ANTHROPIC_API_KEY='sk-ant-...'"
  echo
fi

# --- Installation ---

log_info "Installing a11y-agent Anthony integration..."
echo
log_info "Installation paths:"
log_info "  A11Y Agent:    $A11Y_AGENT_PATH"
log_info "  Anthony:       $ANTHONY_PATH"
log_info "  MCP Server:    $SCRIPT_DIR/a11y-mcp-server.js"
log_info "  Command Module: $SCRIPT_DIR/a11y.py"
echo

# Step 1: Install a11y-agent dependencies
log_info "Step 1/5: Installing a11y-agent dependencies..."
if [[ "$DRY_RUN" == "true" ]]; then
  log_info "[DRY RUN] Would run: cd $A11Y_AGENT_PATH && npm install"
else
  (cd "$A11Y_AGENT_PATH" && npm install) || die "Failed to install a11y-agent dependencies"
  log_success "Dependencies installed"
fi

# Step 2: Copy command module
log_info "Step 2/5: Copying command module to Anthony..."
COMMAND_DEST="$ANTHONY_PATH/commands/a11y.py"
if [[ "$DRY_RUN" == "true" ]]; then
  log_info "[DRY RUN] Would copy: $SCRIPT_DIR/a11y.py -> $COMMAND_DEST"
else
  if [[ -f "$COMMAND_DEST" ]]; then
    log_warning "Command module already exists at $COMMAND_DEST"
    read -rp "Overwrite? [y/N] " response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
      log_info "Skipping command module installation"
    else
      cp "$SCRIPT_DIR/a11y.py" "$COMMAND_DEST" || die "Failed to copy command module"
      log_success "Command module installed"
    fi
  else
    cp "$SCRIPT_DIR/a11y.py" "$COMMAND_DEST" || die "Failed to copy command module"
    log_success "Command module installed"
  fi
fi

# Step 3: Update command module path
log_info "Step 3/5: Updating A11Y_AGENT_PATH in command module..."
if [[ "$DRY_RUN" == "true" ]]; then
  log_info "[DRY RUN] Would update A11Y_AGENT_PATH to: $A11Y_AGENT_PATH"
else
  if [[ -f "$COMMAND_DEST" ]]; then
    # Update the path in the copied file
    if command -v sed &>/dev/null; then
      sed -i "s|A11Y_AGENT_PATH = .*|A11Y_AGENT_PATH = \"$A11Y_AGENT_PATH\"|" "$COMMAND_DEST"
      log_success "Path updated"
    else
      log_warning "sed not available, please manually update A11Y_AGENT_PATH in $COMMAND_DEST"
    fi
  fi
fi

# Step 4: Install tool schemas (optional)
log_info "Step 4/5: Installing tool schemas (optional)..."
SCHEMA_DEST="$ANTHONY_PATH/config/tool_schemas.py"
if [[ -f "$SCHEMA_DEST" ]]; then
  log_info "Tool schemas file exists at $SCHEMA_DEST"
  log_info "Merge manually using: $SCRIPT_DIR/tool_schemas.py"
  log_info "See instructions in tool_schemas.py for details"
else
  log_warning "Anthony tool_schemas.py not found at $SCHEMA_DEST"
  log_warning "This is optional. Tool schemas enable better LLM routing."
fi

# Step 5: Test MCP server
log_info "Step 5/5: Testing MCP server..."
if [[ "$DRY_RUN" == "true" ]]; then
  log_info "[DRY RUN] Would test: node $SCRIPT_DIR/a11y-mcp-server.js"
else
  # Quick test: send initialize message
  TEST_MSG='{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}'
  if echo "$TEST_MSG" | timeout 5s node "$SCRIPT_DIR/a11y-mcp-server.js" &>/dev/null; then
    log_success "MCP server is working"
  else
    log_warning "MCP server test failed or timed out"
    log_warning "This may be normal. Try manual test: node $SCRIPT_DIR/a11y-mcp-server.js"
  fi
fi

# --- Post-Installation ---

echo
log_success "Installation complete!"
echo
log_info "Next steps:"
echo
echo "1. Restart Anthony:"
echo "   pkill -f anthony"
echo "   cd $ANTHONY_PATH"
echo "   python main.py"
echo
echo "2. Test voice commands:"
echo "   > Hey Anthony"
echo "   > Scan example.com for accessibility"
echo
echo "3. Set Claude API key (if not already set):"
echo "   export ANTHROPIC_API_KEY='sk-ant-...'"
echo "   echo 'export ANTHROPIC_API_KEY=\"sk-ant-...\"' >> ~/.bashrc"
echo
log_info "Documentation:"
log_info "  Quick Reference: $SCRIPT_DIR/QUICK_REFERENCE.md"
log_info "  Full README:     $SCRIPT_DIR/README.md"
log_info "  Demo Workflow:   $SCRIPT_DIR/demo-workflow.md"
echo
log_info "Troubleshooting:"
log_info "  Test MCP server: node $SCRIPT_DIR/a11y-mcp-server.js"
log_info "  Test shell wrapper: $SCRIPT_DIR/a11y-tool.sh scan https://example.com"
echo

# --- Optional: Anthony restart prompt ---

if [[ "$DRY_RUN" == "false" ]]; then
  read -rp "Restart Anthony now? [y/N] " response
  if [[ "$response" =~ ^[Yy]$ ]]; then
    log_info "Restarting Anthony..."
    pkill -f anthony || true
    sleep 2
    (cd "$ANTHONY_PATH" && python main.py &)
    log_success "Anthony restarted"
  else
    log_info "Remember to restart Anthony manually:"
    log_info "  pkill -f anthony && cd $ANTHONY_PATH && python main.py"
  fi
fi

exit 0
