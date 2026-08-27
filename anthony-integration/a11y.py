"""
Anthony Command Module: Accessibility Testing (a11y-agent)

Voice-driven accessibility testing using axe-core + Claude AI.

Supported Commands:
- "scan [URL/file] for accessibility"
- "check [URL/file] for WCAG violations"
- "explain [violation-id]"
- "suggest fix for [violation-id]"
- "list accessibility violations"

Examples:
  > "scan example.com for accessibility"
  > "check my-page.html for WCAG violations"
  > "explain color-contrast"
  > "suggest fix for image-alt"
  > "list accessibility violations"

Installation:
  1. Install a11y-agent: cd ~/a11y-agent && npm install
  2. Copy this file to: ~/anthony/commands/a11y.py
  3. Copy a11y-mcp-server.js to: ~/a11y-agent/anthony-integration/
  4. Restart Anthony

Dependencies:
  - a11y-agent (Node.js): https://github.com/yourusername/a11y-agent
  - MCP client (built into Anthony)
"""

import os
import json
from pathlib import Path
from typing import Dict, Any, Optional
from commands.decorators import step, category
from tools.mcp_client import MCPClient
from tools.tts import speak


# --- Configuration ---

A11Y_AGENT_PATH = os.path.expanduser("~/dev/1-workspace/a11y-agent")
MCP_SERVER_PATH = os.path.join(A11Y_AGENT_PATH, "anthony-integration/a11y-mcp-server.js")

# Initialize MCP client (lazy loaded)
_mcp_client: Optional[MCPClient] = None


def get_mcp_client() -> MCPClient:
    """Get or create MCP client for a11y-agent."""
    global _mcp_client

    if _mcp_client is None:
        if not os.path.exists(MCP_SERVER_PATH):
            raise FileNotFoundError(
                f"a11y-agent MCP server not found at {MCP_SERVER_PATH}\n"
                f"Please ensure a11y-agent is installed and anthony-integration/ exists."
            )

        _mcp_client = MCPClient(
            server_command=["node", MCP_SERVER_PATH],
            name="a11y-agent",
        )
        _mcp_client.start()

    return _mcp_client


def cleanup():
    """Cleanup MCP client on shutdown."""
    global _mcp_client
    if _mcp_client:
        _mcp_client.stop()
        _mcp_client = None


# --- Helper Functions ---

def format_violation_summary(data: Dict[str, Any]) -> str:
    """Format scan results into human-readable summary."""
    summary = data.get("summary", {})
    total = summary.get("total", 0)

    if total == 0:
        return "No accessibility violations found."

    critical = summary.get("critical", 0)
    serious = summary.get("serious", 0)
    moderate = summary.get("moderate", 0)
    minor = summary.get("minor", 0)

    parts = []
    if critical > 0:
        parts.append(f"{critical} critical")
    if serious > 0:
        parts.append(f"{serious} serious")
    if moderate > 0:
        parts.append(f"{moderate} moderate")
    if minor > 0:
        parts.append(f"{minor} minor")

    return f"Found {total} violations: {', '.join(parts)}"


def format_violation_list(data: Dict[str, Any]) -> str:
    """Format violation list for TTS output."""
    violations = data.get("violations", [])

    if not violations:
        return "No violations found."

    lines = []
    for i, v in enumerate(violations[:5], 1):  # Limit to top 5 for voice
        lines.append(f"{i}. {v['impact']} - {v['help']}")

    if len(violations) > 5:
        lines.append(f"... and {len(violations) - 5} more.")

    return "\n".join(lines)


# --- Command Handlers ---

@step(
    "scan {target} for accessibility",
    "check {target} for WCAG violations",
    "test {target} for accessibility",
    category="accessibility"
)
def scan_accessibility(target: str) -> str:
    """
    Scan a URL or HTML file for WCAG accessibility violations.

    Args:
        target: URL (http://...) or file path

    Returns:
        Summary of violations found
    """
    try:
        client = get_mcp_client()

        # Call the scan_accessibility tool
        result = client.call_tool("scan_accessibility", {"target": target})

        # Parse result
        data = json.loads(result) if isinstance(result, str) else result

        # Format summary
        summary = format_violation_summary(data)

        # Speak the summary
        speak(summary)

        # Also print detailed results
        print(f"\n{'='*60}")
        print(f"A11Y SCAN: {target}")
        print(f"{'='*60}")
        print(f"\n{summary}\n")

        violations = data.get("violations", [])
        if violations:
            print("Top violations:")
            for v in violations[:5]:
                print(f"  [{v['impact'].upper()}] {v['id']}")
                print(f"    {v['help']}")
                print(f"    Affected: {len(v['nodes'])} element(s)\n")

        return summary

    except Exception as e:
        error_msg = f"Accessibility scan failed: {str(e)}"
        speak(error_msg)
        return error_msg


@step(
    "explain {violation_id}",
    "what is {violation_id}",
    "tell me about {violation_id}",
    category="accessibility"
)
def explain_violation(violation_id: str) -> str:
    """
    Get detailed explanation of a specific accessibility violation.

    Args:
        violation_id: The axe-core violation ID (e.g., "color-contrast")

    Returns:
        Detailed explanation
    """
    try:
        client = get_mcp_client()

        result = client.call_tool("explain_violation", {"violation_id": violation_id})
        data = json.loads(result) if isinstance(result, str) else result

        if "error" in data:
            speak(data["error"])
            return data["error"]

        # Format explanation
        explanation = (
            f"{data['help']}\n\n"
            f"Impact: {data['impact']}\n"
            f"WCAG: {', '.join(data['wcagCriteria'])}\n\n"
            f"Affects {data['affectedElements']} element(s)."
        )

        speak(f"{data['help']}. Impact: {data['impact']}.")

        print(f"\n{'='*60}")
        print(f"VIOLATION: {violation_id}")
        print(f"{'='*60}")
        print(f"\n{explanation}\n")

        return explanation

    except Exception as e:
        error_msg = f"Explanation failed: {str(e)}"
        speak(error_msg)
        return error_msg


@step(
    "suggest fix for {violation_id}",
    "how to fix {violation_id}",
    "fix {violation_id}",
    category="accessibility"
)
def suggest_fix(violation_id: str) -> str:
    """
    Get AI-powered fix suggestions for a specific violation.

    Args:
        violation_id: The violation ID to fix (or "all" for all violations)

    Returns:
        Fix suggestions from Claude AI
    """
    try:
        client = get_mcp_client()

        speak("Generating fix suggestions with Claude AI...")

        result = client.call_tool("get_fix_suggestion", {"violation_id": violation_id})
        data = json.loads(result) if isinstance(result, str) else result

        if "message" in data:
            speak(data["message"])
            return data["message"]

        suggestions = data.get("fixSuggestions", "No suggestions available.")

        speak("Fix suggestions generated. See output for details.")

        print(f"\n{'='*60}")
        print(f"FIX SUGGESTIONS: {violation_id}")
        print(f"{'='*60}")
        print(f"\n{suggestions}\n")

        return suggestions

    except Exception as e:
        error_msg = f"Fix suggestion failed: {str(e)}"
        speak(error_msg)
        return error_msg


@step(
    "list accessibility violations",
    "show violations",
    "what violations were found",
    category="accessibility"
)
def list_violations() -> str:
    """
    List violations from the most recent scan.

    Returns:
        List of violations
    """
    try:
        client = get_mcp_client()

        result = client.call_tool("list_violations", {})
        data = json.loads(result) if isinstance(result, str) else result

        summary = format_violation_list(data)

        speak(f"Found {data['total']} violations.")

        print(f"\n{'='*60}")
        print(f"VIOLATIONS: {data['target']}")
        print(f"{'='*60}")
        print(f"\n{summary}\n")

        return summary

    except Exception as e:
        error_msg = f"List violations failed: {str(e)}"
        speak(error_msg)
        return error_msg


# --- Context Helpers ---

@step(
    "scan clipboard for accessibility",
    "check clipboard URL",
    category="accessibility"
)
def scan_clipboard() -> str:
    """
    Scan the URL from clipboard for accessibility violations.

    Returns:
        Scan results
    """
    try:
        # Get clipboard content (uses Anthony's clipboard utility)
        from tools.clipboard import get_clipboard_text

        url = get_clipboard_text()

        if not url:
            speak("Clipboard is empty.")
            return "Clipboard is empty."

        # Validate it looks like a URL
        if not (url.startswith("http://") or url.startswith("https://")):
            speak("Clipboard does not contain a valid URL.")
            return f"Invalid URL in clipboard: {url}"

        speak(f"Scanning {url}")

        # Delegate to main scan function
        return scan_accessibility(url)

    except Exception as e:
        error_msg = f"Clipboard scan failed: {str(e)}"
        speak(error_msg)
        return error_msg


# --- Chaining Examples ---

@step(
    "scan {target} and suggest fixes",
    "check {target} and show fixes",
    category="accessibility"
)
def scan_and_fix(target: str) -> str:
    """
    Multi-step: Scan for violations, then generate AI fix suggestions.

    Args:
        target: URL or file path

    Returns:
        Combined scan + fix results
    """
    # Step 1: Scan
    scan_result = scan_accessibility(target)

    # Step 2: Generate fixes (for all violations)
    if "No violations" not in scan_result:
        speak("Now generating fix suggestions...")
        fix_result = suggest_fix("all")
        return f"{scan_result}\n\n{fix_result}"

    return scan_result


# Register cleanup on module unload
import atexit
atexit.register(cleanup)
