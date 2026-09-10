# Anthony Integration — design sketch

> **Status: not wired up. Do not demo this.**
>
> `install.sh` has never been run — `a11y.py` is not present in
> `anthony/commands/`. Nothing here has been executed end to end.

[Anthony](https://github.com/g0dd4rd/anthony) is a GNOME voice assistant. The
idea was to let it drive this scanner, so accessibility checks are reachable
from the desktop rather than a terminal:

> *"Hey Anthony, check accessibility of my homepage"*

Feature 5 (`npm run agent`) delivers the same hands-free workflow without the
dependency, which is why this was never finished. Keeping it as a sketch of the
desktop-integration path.

## What's here

| File | Role |
| --- | --- |
| `a11y.py` | Anthony command module — maps utterances to scans |
| `tool_schemas.py` | Tool definitions Anthony exposes to its model |
| `a11y-mcp-server.js` | MCP server wrapping the scanner |
| `a11y-tool.sh` | Shell shim |
| `install.sh` | Copies the module into an Anthony checkout |

## Approach

Anthony calls the a11y-agent CLI rather than reimplementing it, so the Node
stack stays put and there is no rewrite.

## Before anyone picks this up

- The MCP server needs `ANTHROPIC_API_KEY`. This is the **only** path in the
  project that uses Claude — the CLI runs on local Ollama and needs no key.
- `a11y-mcp-server.js:220` pins `claude-sonnet-4-20250514`, which is outdated.
  Update it before use.
- `install.sh` writes into an Anthony checkout. Read it before running it.
