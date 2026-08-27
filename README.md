# A11Y Agent

**AI-Powered Accessibility Testing for Red Hat Innovation Days 2026**

A11Y Agent combines [axe-core](https://github.com/dequelabs/axe-core) automated accessibility testing with Claude AI to provide:

- 🔍 **Automated Detection** — Industry-standard WCAG 2.0/2.1 A/AA violation detection
- 🤖 **AI-Powered Fixes** — Context-aware, copy-pasteable code fixes
- 📚 **Developer Education** — Explanations of WHY violations matter and their impact on users with disabilities

## Quick Start

```bash
# Install dependencies
npm install

# Scan a local HTML file
node src/scan.js --file samples/bad-page.html

# Scan with AI fix suggestions (requires ANTHROPIC_API_KEY)
export ANTHROPIC_API_KEY="your-key-here"
node src/scan.js --file samples/bad-page.html --fix

# Scan a live URL
node src/scan.js --url https://example.com

# Get JSON output (for CI/CD)
node src/scan.js --url https://example.com --json

# Voice command mode (hands-free scanning)
./setup-voice.sh  # One-time setup
node src/scan.js --listen  # Press SPACE to speak: "scan samples/bad-page.html"

# Text-to-speech output
node src/scan.js --file samples/bad-page.html --voice
```

## Features

✅ Multi-source scanning (URLs or local HTML files)  
✅ WCAG 2.0/2.1 Level A/AA coverage  
✅ Impact-based prioritization (Critical → Serious → Moderate → Minor)  
✅ Colorized terminal output  
✅ AI context-aware fix suggestions via Claude  
✅ JSON export for CI/CD integration  
✅ **Voice commands** — Hands-free scanning via speech-to-text (--listen)  
✅ **Text-to-speech** — Audio output of results (--voice)  

## Voice Commands

Use speech-to-text for hands-free scanning:

```bash
# One-time setup (downloads Vosk model)
./setup-voice.sh

# Start voice command mode
node src/scan.js --listen

# Press and hold SPACE, then speak:
# "scan samples/bad-page.html"
# "scan example.com and show me the fixes"
# "check accessibility of bad-page.html output as json"
```

**Features:**
- Push-to-talk interface (no wake word needed)
- Offline processing (privacy-first, uses Vosk)
- Natural language parsing ("scan X and show fixes")
- Audio feedback (beeps for recording start/stop)

See [VOICE_COMMANDS.md](VOICE_COMMANDS.md) for detailed setup and usage.

## How It Works

1. **Playwright** launches a headless browser and navigates to the target
2. **axe-core** analyzes the page against WCAG guidelines (~50-60% automated coverage)
3. **Claude AI** receives violations + source HTML and generates:
   - WHY the violation matters (impact on users with disabilities)
   - EXACT code fix (before → after)
   - WCAG criterion addressed

## Innovation Days Challenge

**Challenge:** Accessibility in Software Development at Scale  
**Team:** TBD (3-10 members)  
**Deadline:** September 15, 2026  

**The Gap We're Filling:**  
Most accessibility tools stop at detection. We bridge the gap from "what's broken" to "how to fix it" using AI to understand context and generate actionable solutions.

## Test It Out

The `samples/bad-page.html` file contains 9+ intentional accessibility violations:

- Missing `lang` attribute
- Skipped heading levels
- Low contrast text
- Images without alt text
- Form inputs without labels
- Icon-only links
- Tables without headers
- Non-interactive click handlers
- Auto-playing video without controls

Run the scanner to see them all detected and get AI-powered fix suggestions!

## Dependencies

**Core:**
- `playwright` — Headless browser automation
- `@axe-core/playwright` — Accessibility testing engine
- `@anthropic-ai/sdk` — Claude AI integration
- `commander` — CLI argument parsing
- `chalk` — Terminal color output

**Voice Commands (optional):**
- `vosk` — Offline speech-to-text engine
- `mic` — Microphone audio capture
- `alsa-utils` — System audio utilities (Linux)
- Vosk model files — Download via `./setup-voice.sh`

## Project Status

🚧 **Prototype Phase** — Functional MVP, ready for demo iteration

**Next Steps:**
- [x] Voice commands integration (Vosk STT) — See [VOICE_COMMANDS.md](VOICE_COMMANDS.md)
- [ ] Add batch scanning for multiple URLs
- [ ] Fix validation (re-scan after applying fixes)
- [ ] Interactive mode (apply fixes directly to files)
- [ ] HTML/PDF report generation
- [ ] CI/CD integration examples
- [ ] Wake word support ("hey a11y") for voice commands

## License

TBD

## Contact

**Lead:** Dallas Spohn (PTL Team)  
**Lead:** Surya Pathak   
**Red Hat Innovation Days 2026 Global AI Challenge**
