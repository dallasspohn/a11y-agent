"""
Anthony Tool Schema Configuration for A11Y Agent

This file defines OpenAI-format tool schemas for a11y-agent that Anthony's
LLM can use for tool-calling mode.

Installation:
  Copy or merge these schemas into: ~/anthony/config/tool_schemas.py

Usage:
  Anthony's LLM (Gemma 4) will automatically detect these tools and can
  invoke them based on user intent, even without exact command matches.

Example:
  User: "Is example.com accessible?"
  → LLM infers to call scan_accessibility(target="https://example.com")
"""

# Add these to your existing TOOL_SCHEMAS dict in ~/anthony/config/tool_schemas.py

A11Y_TOOL_SCHEMAS = {
    "scan_accessibility": {
        "type": "function",
        "function": {
            "name": "scan_accessibility",
            "description": (
                "Scan a URL or local HTML file for WCAG accessibility violations "
                "using axe-core. Returns a summary of critical, serious, moderate, "
                "and minor violations found, along with detailed information about "
                "each violation including affected elements, WCAG criteria, and "
                "remediation guidance."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "target": {
                        "type": "string",
                        "description": (
                            "The URL (http://... or https://...) or file path "
                            "(/path/to/file.html) to scan for accessibility violations."
                        ),
                    },
                    "tags": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": (
                            "WCAG tags to test against. Defaults to: wcag2a, wcag2aa, "
                            "wcag21a, wcag21aa, best-practice. Other options: wcag2aaa, "
                            "wcag22aa, section508, experimental."
                        ),
                        "default": ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
                    },
                },
                "required": ["target"],
            },
        },
    },

    "explain_violation": {
        "type": "function",
        "function": {
            "name": "explain_violation",
            "description": (
                "Get a detailed explanation of a specific accessibility violation "
                "from the most recent scan. Includes impact level, WCAG criteria, "
                "affected elements, and examples of the violation in context."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "violation_id": {
                        "type": "string",
                        "description": (
                            "The axe-core violation rule ID to explain (e.g., "
                            "'color-contrast', 'image-alt', 'html-has-lang'). "
                            "Must be from the most recent scan results."
                        ),
                    },
                },
                "required": ["violation_id"],
            },
        },
    },

    "get_fix_suggestion": {
        "type": "function",
        "function": {
            "name": "get_fix_suggestion",
            "description": (
                "Generate AI-powered fix suggestions for accessibility violations "
                "using Claude AI. Provides before/after code examples, explains "
                "why the fix matters for users with disabilities, and references "
                "relevant WCAG success criteria."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "violation_id": {
                        "type": "string",
                        "description": (
                            "Optional: specific violation ID to generate fixes for "
                            "(e.g., 'color-contrast'). If omitted, generates fixes "
                            "for all violations from the most recent scan."
                        ),
                    },
                },
            },
        },
    },

    "list_violations": {
        "type": "function",
        "function": {
            "name": "list_violations",
            "description": (
                "List all accessibility violations from the most recent scan. "
                "Can optionally filter by impact level (critical, serious, "
                "moderate, minor)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "impact": {
                        "type": "string",
                        "enum": ["critical", "serious", "moderate", "minor"],
                        "description": (
                            "Optional: filter violations by impact level. "
                            "If omitted, returns all violations."
                        ),
                    },
                },
            },
        },
    },
}


# --- Integration Instructions ---

"""
To integrate these schemas into Anthony:

1. Open ~/anthony/config/tool_schemas.py

2. Import this file:
   ```python
   from commands.a11y_schemas import A11Y_TOOL_SCHEMAS
   ```

3. Merge into existing TOOL_SCHEMAS:
   ```python
   TOOL_SCHEMAS = {
       # ... existing tools ...
       **A11Y_TOOL_SCHEMAS,  # Add a11y-agent tools
   }
   ```

4. Restart Anthony:
   ```bash
   pkill -f anthony
   cd ~/anthony
   python main.py
   ```

5. Test tool calling:
   ```
   User: "Is example.com accessible?"

   Anthony: [Calls scan_accessibility("example.com")]
            "Found 12 violations: 2 critical, 5 serious..."
   ```
"""


# --- Example Tool Call Patterns ---

"""
These natural language inputs will trigger tool calls:

User Intent → Tool Called
==========================================

"Scan example.com for accessibility"
  → scan_accessibility(target="https://example.com")

"Is my-page.html accessible?"
  → scan_accessibility(target="my-page.html")

"Check github.com for WCAG compliance"
  → scan_accessibility(target="https://github.com")

"What's wrong with color-contrast?"
  → explain_violation(violation_id="color-contrast")

"How do I fix image-alt?"
  → get_fix_suggestion(violation_id="image-alt")

"Show me all critical violations"
  → list_violations(impact="critical")

"List accessibility issues"
  → list_violations()

"Suggest fixes for all violations"
  → get_fix_suggestion()

"""


# --- Advanced: Custom Tool Categories ---

"""
You can categorize tools for better LLM routing:

TOOL_CATEGORIES = {
    "accessibility": {
        "description": "Accessibility testing and WCAG compliance tools",
        "tools": [
            "scan_accessibility",
            "explain_violation",
            "get_fix_suggestion",
            "list_violations",
        ],
        "triggers": [
            "accessibility",
            "a11y",
            "wcag",
            "accessible",
            "disability",
            "screen reader",
            "color contrast",
            "alt text",
        ],
    },
}

This helps Anthony route accessibility-related queries to the right tools.
"""


# --- Testing Tool Schemas ---

"""
To test that schemas are valid:

```python
import json
from jsonschema import validate

# Test schema validity
for name, schema in A11Y_TOOL_SCHEMAS.items():
    try:
        # Validate against OpenAI function calling schema
        assert "type" in schema
        assert schema["type"] == "function"
        assert "function" in schema
        assert "name" in schema["function"]
        assert "description" in schema["function"]
        assert "parameters" in schema["function"]

        print(f"✓ {name} schema is valid")
    except AssertionError as e:
        print(f"✗ {name} schema is invalid: {e}")
```

Expected output:
```
✓ scan_accessibility schema is valid
✓ explain_violation schema is valid
✓ get_fix_suggestion schema is valid
✓ list_violations schema is valid
```
"""
