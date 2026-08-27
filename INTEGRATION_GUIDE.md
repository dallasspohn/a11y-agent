# Conversation System - Integration Guide

## Quick Start

### 1. Test the Conversation System

Run the demo with mock data:

```bash
# Interactive mode (type commands)
node src/conversation-demo.js interactive

# Scripted walkthrough (automated)
node src/conversation-demo.js scripted

# Test command parser
node src/conversation-demo.js parser

# Test state machine
node src/conversation-demo.js state
```

### 2. Add to package.json Scripts

```json
{
  "scripts": {
    "scan": "node src/scan.js",
    "demo": "node src/scan.js --url http://localhost:8080",
    "conversation-demo": "node src/conversation-demo.js",
    "conversation-test": "node src/conversation-demo.js scripted"
  }
}
```

### 3. Integrate with scan.js

Add the `--interactive` flag to enable conversation mode after scanning.

#### Step 1: Add CLI Flag

In `src/scan.js`, add to the program options:

```javascript
program
  .option('--url <url>', 'URL to scan')
  .option('--file <path>', 'Local HTML file to scan')
  .option('--fix', 'Generate AI fix suggestions via Claude', false)
  .option('--json', 'Output raw JSON results', false)
  .option('--voice', 'Enable text-to-speech output', false)
  .option('--rate <speed>', 'Speech rate (words per minute, default 175)', '175')
  .option('--listen', 'Enable voice command mode (speech-to-text)', false)
  .option('--model-path <path>', 'Path to Vosk model directory')
  .option('--interactive', 'Enable interactive conversation mode', false)  // NEW
  .parse();
```

#### Step 2: Import Conversation Module

At the top of `src/scan.js`:

```javascript
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { program } from 'commander';
import chalk from 'chalk';
import { exec } from 'child_process';
import { listenForCommand, checkVoskAvailability, parseVoiceCommand } from './voice-commands.js';
import { startConversation } from './conversation.js';  // NEW
import readline from 'readline';  // NEW (for text-only interactive mode)
```

#### Step 3: Add Interactive Mode to main()

Replace or extend the end of the `main()` function:

```javascript
async function main() {
  // ... existing voice command and scan logic ...

  await printResults(results);

  let fixes = null;

  // Generate fixes if requested OR if interactive mode is enabled
  if ((opts.fix || opts.interactive) && results.violations.length > 0) {
    console.log(chalk.bold.blue('\n  Generating AI fix suggestions...\n'));
    await speakText('Generating AI fix suggestions');
    fixes = await getFixSuggestions(results.violations, html);
    
    if (!opts.interactive) {
      // Non-interactive mode: just print fixes and exit
      console.log(fixes);
      console.log();
      await speakText('Fix suggestions generated. See output for details.');
    }
  }

  // Start interactive conversation mode
  if (opts.interactive) {
    if (results.violations.length === 0) {
      console.log(chalk.green('\n  No violations to explore. Exiting.\n'));
      return;
    }

    // Voice mode: use TTS/STT
    if (opts.voice && opts.listen) {
      const voskCheck = await checkVoskAvailability();
      const modelPath = opts.modelPath || voskCheck.modelPath;

      await startConversation(
        results.violations,
        fixes,
        {
          voice: true,
          tts: speakText,
          stt: async () => {
            const result = await listenForCommand(modelPath);
            return result.text || '';
          },
        }
      );
    }
    // Text mode: use readline
    else {
      await startTextConversation(results.violations, fixes);
    }
  }
}
```

#### Step 4: Add Text-only Conversation Function

Add this helper function to `src/scan.js`:

```javascript
/**
 * Text-based conversation mode (no voice)
 */
async function startTextConversation(violations, fixes) {
  const { ConversationState, handleUserInput, generateResponse, States } = await import('./conversation.js');
  
  const state = new ConversationState(violations, fixes);

  // Show initial summary
  const initialResponse = generateResponse(state);
  console.log(initialResponse.text);
  
  if (initialResponse.nextState) {
    state.state = initialResponse.nextState;
  }

  // Set up readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = () => {
    if (state.state === States.DONE) {
      rl.close();
      return;
    }

    rl.question(chalk.cyan('\n> '), (input) => {
      if (!input.trim()) {
        askQuestion();
        return;
      }

      const response = handleUserInput(input, state);
      console.log(response.text);

      if (state.state === States.DONE) {
        rl.close();
      } else {
        askQuestion();
      }
    });
  };

  askQuestion();
}
```

## Usage Examples

### Text-only Interactive Mode

```bash
# Scan and enter interactive mode (text input)
node src/scan.js --file samples/bad-page.html --interactive

# Scan with pre-generated fixes
node src/scan.js --url http://example.com --fix --interactive
```

Example session:
```
  Scanning samples/bad-page.html...

  A11Y AGENT SCAN RESULTS

  45 rules passed
  9 violations found


  A11Y SCAN COMPLETE

  9 violations found:  3 critical  4 serious  1 moderate  1 minor 

  What would you like to focus on?

> critical

  [1 of 3] CRITICAL
  CRITICAL: color-contrast
  Elements must have sufficient color contrast
  Affects 1 element

  Say "fix" for solution, "code" to see HTML, "next" to continue

> fix

  AI FIX SUGGESTION:

  For: color-contrast
  [Claude's fix details...]

> next

  [2 of 3] CRITICAL
  ...
```

### Voice Interactive Mode

```bash
# Scan with voice input/output in interactive mode
node src/scan.js --file samples/bad-page.html --interactive --voice --listen
```

User speaks commands, system responds via TTS.

### Non-interactive Mode (Original Behavior)

```bash
# Just scan (no interaction)
node src/scan.js --url http://example.com

# Scan with fixes (print all, no interaction)
node src/scan.js --url http://example.com --fix
```

## Command Reference

Once in interactive mode, you can say:

### Navigation
- `next`, `continue`, `skip` - Next violation
- `previous`, `back`, `go back` - Previous violation
- `3`, `violation 5` - Jump to specific number

### Filtering
- `critical` - Show only critical violations
- `serious` - Show only serious violations  
- `moderate` - Show only moderate violations
- `minor` - Show only minor violations
- `all` - Show all violations (remove filter)

### Details
- `fix`, `how do I fix` - Show AI fix suggestion
- `code`, `show code`, `html` - Show HTML snippet
- `details`, `explain` - Show violation details again

### Utility
- `repeat` - Repeat last message
- `help` - Show command list
- `summary` - Go back to scan overview
- `done`, `exit`, `quit` - End session

## Voice Commands Integration

The conversation system integrates with the existing voice command infrastructure:

### Continuous Listening Pattern

For production use, you might want continuous listening instead of push-to-talk:

```javascript
// In startConversation() voice mode
while (state.state !== States.DONE) {
  console.log(chalk.dim('\n[Listening for command...]'));
  
  try {
    const voiceInput = await listenForCommand(modelPath);
    const text = voiceInput.text || voiceInput.url || voiceInput.file || '';
    
    if (!text) {
      console.log(chalk.yellow('No command detected, try again'));
      continue;
    }

    console.log(chalk.dim(`[You said: "${text}"]`));
    
    const response = handleUserInput(text, state);
    console.log(response.text);
    
    if (tts) {
      await tts(response.speech);
    }
  } catch (err) {
    console.error(chalk.red(`Error: ${err.message}`));
    break;
  }
}
```

### Wake Word Support (Future)

```javascript
// Continuously listen for "hey a11y agent" to activate
await listenForWakeWord('hey a11y agent');
await tts('How can I help?');
const command = await listenForCommand(modelPath);
// ... process command
```

## Troubleshooting

### "Command not recognized"

The parser looks for keyword matches. Try exact phrases from the command reference:
- ❌ "tell me about the next one"
- ✅ "next"

Or say "help" to see available commands.

### "No fix suggestions available"

Interactive mode requires the `--fix` flag or fixes are auto-generated. Ensure Claude API key is set:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

### Voice Mode Not Working

Check Vosk installation:

```bash
# Install dependencies
npm install vosk mic

# Download model
wget https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip
unzip vosk-model-small-en-us-0.15.zip -d ./models/
```

Check microphone:

```bash
# Test mic with arecord
arecord -d 3 test.wav
aplay test.wav
```

### TTS Not Speaking

Check espeak-ng installation:

```bash
# Install on Fedora
sudo dnf install espeak-ng

# Install on Debian/Ubuntu
sudo apt-get install espeak-ng

# Test
espeak-ng "Hello world"
```

## Performance Tips

### Lazy Fix Generation

Only generate fixes when user requests them:

```javascript
// Modified approach: generate fixes on-demand per violation
async function getFixForViolation(violation, html) {
  // Cache fixes by violation ID
  if (!fixCache[violation.id]) {
    fixCache[violation.id] = await getFixSuggestions([violation], html);
  }
  return fixCache[violation.id];
}

// Call when user says "fix"
const fix = await getFixForViolation(state.getCurrentViolation(), html);
```

### Reduce Latency

Voice mode benefits from:
- Faster speech rate: `--rate 200`
- Shorter TTS phrases (condense responses)
- Parallel TTS (speak while processing next command)

## Testing Checklist

- [ ] Text mode works without voice dependencies
- [ ] Voice mode integrates with existing TTS/STT
- [ ] All commands recognized correctly
- [ ] State transitions work as expected
- [ ] Navigation (next/previous) handles boundaries
- [ ] Category filtering works for all impact levels
- [ ] Fix display works with and without Claude API
- [ ] Code snippets display correctly
- [ ] Help command shows all options
- [ ] Done/exit properly terminates session
- [ ] Works with zero violations (no crash)
- [ ] Works with missing fixes (graceful degradation)

## Example Full Session

```bash
$ node src/scan.js --file samples/bad-page.html --interactive

  Scanning samples/bad-page.html...

  A11Y AGENT SCAN RESULTS
  45 rules passed
  9 violations found

  Generating AI fix suggestions...

  A11Y SCAN COMPLETE
  9 violations found:  3 critical  4 serious  1 moderate  1 minor 
  What would you like to focus on?

> help

  AVAILABLE COMMANDS:
  Navigation: next, previous, done
  Categories: critical, serious, moderate, minor, all
  Details: fix, code, details
  Utility: repeat, help, summary

> critical

  [1 of 3] CRITICAL
  CRITICAL: color-contrast
  Elements must have sufficient color contrast
  Affects 1 element
  Say "fix" for solution, "code" to see HTML, "next" to continue

> fix

  AI FIX SUGGESTION:
  (See full output for detailed fixes)

  For: color-contrast
  Elements must have sufficient color contrast

> code

  HTML CODE:
  Element 1: #submit-button
  <button id="submit-button" style="color: #ccc; background: #fff">Submit</button>

> next

  [2 of 3] CRITICAL
  CRITICAL: image-alt
  Images must have alternate text
  Affects 2 elements
  Say "fix" for solution, "code" to see HTML, "next" to continue

> next

  [3 of 3] CRITICAL
  CRITICAL: button-name
  Buttons must have discernible text
  Affects 1 element
  Say "fix" for solution, "code" to see HTML, "next" to continue

> serious

  [1 of 4] SERIOUS
  SERIOUS: label
  Form elements must have labels
  Affects 1 element
  Say "fix" for solution, "code" to see HTML, "next" to continue

> summary

  A11Y SCAN COMPLETE
  9 violations found:  3 critical  4 serious  1 moderate  1 minor 
  What would you like to focus on?

> done

  Accessibility review complete. Goodbye!
```

## Next Steps

1. Test the demo: `node src/conversation-demo.js interactive`
2. Integrate into scan.js following steps above
3. Test with real scans: `node src/scan.js --file <path> --interactive`
4. Try voice mode: add `--voice --listen` flags
5. Customize responses in `ResponseGenerator` class
6. Add new commands to `CommandParser.COMMANDS`
7. Extend state machine with new states as needed

## Support

See `CONVERSATION_ARCHITECTURE.md` for detailed design documentation.
