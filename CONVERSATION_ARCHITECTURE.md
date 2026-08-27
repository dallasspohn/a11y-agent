# Conversation Navigation System - Architecture

## Overview

The conversation navigation system enables natural language interaction with a11y-agent accessibility scan results. Users can explore violations, request fixes, view code snippets, and navigate between issues using voice or text commands.

## Architecture Components

### 1. State Machine (`ConversationState`)

Manages conversation state and navigation context.

**States:**
- `SUMMARY` - Initial overview of scan results
- `BROWSING_VIOLATIONS` - Navigating through violations list
- `SHOWING_VIOLATION` - Displaying current violation details
- `SHOWING_FIX` - Displaying AI-generated fix suggestion
- `SHOWING_CODE` - Displaying HTML code snippet
- `ASKING_CATEGORY` - Prompting user to select impact category
- `DONE` - Session ended

**Key Methods:**
```javascript
getCurrentViolation()    // Get current violation being viewed
getViolationList()        // Get violations in current context (filtered or all)
moveNext()                // Navigate to next violation
movePrevious()            // Navigate to previous violation
jumpToCategory(category)  // Filter to specific impact level
resetCategory()           // Clear filter, show all violations
getSummary()              // Get violation count summary
```

**State Data:**
```javascript
{
  violations: [],           // All violations from scan
  fixes: null,              // AI-generated fix suggestions (optional)
  state: 'summary',         // Current conversation state
  currentIndex: 0,          // Current position in violation list
  currentCategory: null,    // Active impact filter (critical/serious/moderate/minor)
  lastResponse: '',         // Last text shown (for repeat command)
  history: [],              // Interaction log
  violationsByImpact: {},   // Violations grouped by impact level
  sortedViolations: [],     // All violations sorted by impact
}
```

### 2. Command Parser (`CommandParser`)

Maps natural language input to recognized commands.

**Supported Commands:**

| Command | Variants | Action |
|---------|----------|--------|
| `NEXT` | next, continue, skip, next violation | Move to next violation |
| `PREVIOUS` | previous, back, go back, prev, last one | Move to previous violation |
| `CRITICAL` | critical, show critical, critical issues | Filter to critical violations |
| `SERIOUS` | serious, show serious, serious issues | Filter to serious violations |
| `MODERATE` | moderate, show moderate, moderate issues | Filter to moderate violations |
| `MINOR` | minor, show minor, minor issues | Filter to minor violations |
| `ALL` | all, show all, everything | Show all violations (remove filter) |
| `FIX` | fix, how do i fix, show fix, solution, repair | Show AI fix suggestion |
| `CODE` | code, show code, html, source | Show HTML snippet |
| `DETAILS` | details, more details, explain, tell me more | Show violation details |
| `REPEAT` | repeat, say again, what, pardon | Repeat last response |
| `HELP` | help, what can i say, commands, options | Show available commands |
| `SUMMARY` | summary, overview, show summary, start over | Return to scan summary |
| `DONE` | done, exit, quit, finish, stop, bye | End session |

**Numeric Input:**
- `"3"` or `"violation 5"` → Jump to specific violation number (1-indexed)

**Unknown Commands:**
Returns `'UNKNOWN'` - triggers help message

### 3. Response Generator (`ResponseGenerator`)

Creates text and speech output based on state and command.

**Response Format:**
```javascript
{
  text: "...",        // Formatted terminal output (with chalk colors)
  speech: "...",      // Clean text for TTS (no ANSI codes)
  nextState: "..."    // New state to transition to (or null to stay)
}
```

**Key Methods:**
- `generateSummary(state)` - Scan overview with violation counts
- `generateViolationDetail(state)` - Current violation info
- `generateFixSuggestion(state, fixes)` - AI fix for current violation
- `generateCodeSnippet(state)` - HTML code for affected elements
- `generateHelp()` - Command reference
- `generateUnknownCommand()` - Error message for unrecognized input
- `generateDone()` - Goodbye message

### 4. Main Handler (`handleUserInput`)

Orchestrates command parsing, state updates, and response generation.

**Flow:**
```
User Input
    ↓
CommandParser.parse()
    ↓
[Execute Command]
    ↓
ResponseGenerator.generate*()
    ↓
Update State
    ↓
Record Interaction
    ↓
Return Response
```

## User Journey Example

```
1. Scan completes
   → State: SUMMARY
   → "9 violations found. What would you like to focus on?"

2. User: "critical issues"
   → State: SHOWING_VIOLATION
   → "[1 of 3] CRITICAL: color-contrast
       Elements must have sufficient color contrast
       Affects 1 element
       Say 'fix' for solution, 'code' to see HTML, 'next' to continue"

3. User: "how do I fix it?"
   → State: SHOWING_FIX
   → "AI FIX SUGGESTION:
       For: color-contrast
       [Shows fix details from Claude]"

4. User: "show me the code"
   → State: SHOWING_CODE
   → "HTML CODE:
       Element 1: #submit-button
       <button id='submit-button' style='color: #ccc; background: #fff'>Submit</button>"

5. User: "next"
   → State: SHOWING_VIOLATION
   → "[2 of 3] CRITICAL: image-alt..."

6. User: "skip to serious"
   → State: SHOWING_VIOLATION
   → "[1 of 4] SERIOUS: label..."

7. User: "done"
   → State: DONE
   → "Accessibility review complete. Goodbye!"
```

## Integration with scan.js

### Basic Integration (Text-only)

```javascript
import { ConversationState, handleUserInput, generateResponse } from './conversation.js';

// After scan completes
const state = new ConversationState(results.violations, fixes);

// Show initial summary
const initialResponse = generateResponse(state);
console.log(initialResponse.text);
if (initialResponse.nextState) {
  state.state = initialResponse.nextState;
}

// Text input loop (using readline)
rl.on('line', (input) => {
  const response = handleUserInput(input, state);
  console.log(response.text);
  
  if (state.state === 'done') {
    rl.close();
  }
});
```

### Voice Integration (with TTS/STT)

```javascript
import { startConversation } from './conversation.js';
import { speakText } from './scan.js';
import { listenForCommand } from './voice-commands.js';

// After scan completes
await startConversation(
  results.violations,
  fixes,
  {
    voice: true,
    tts: speakText,
    stt: () => listenForCommand(modelPath),
  }
);
```

### Command-line Flag

Add to `scan.js`:

```javascript
program
  .option('--interactive', 'Enable interactive conversation mode', false)
  .option('--converse', 'Alias for --interactive', false)
```

Implementation:

```javascript
if (opts.interactive || opts.converse) {
  // Get fixes if not already generated
  if (!fixes && results.violations.length > 0) {
    console.log(chalk.dim('Generating AI fix suggestions for interactive mode...'));
    fixes = await getFixSuggestions(results.violations, html);
  }

  // Start conversation
  await startConversation(
    results.violations,
    fixes,
    {
      voice: opts.voice,
      tts: opts.voice ? speakText : null,
      stt: opts.voice ? () => listenForCommand(modelPath) : null,
    }
  );
}
```

## Error Handling

### Unknown Commands
- Response: "I did not understand that command. Say 'help' for options."
- State: Remains unchanged
- User can say "help" to see command list

### Out of Bounds Navigation
- "No more violations. Say 'summary' to review or 'done' to exit."
- "Already at first violation."

### Empty Categories
- "No critical violations found."
- State: Remains unchanged

### Missing Fix Data
- "No fix suggestions available. Run with --fix flag to generate AI suggestions."
- State: Remains unchanged

### Voice Errors
- Microphone error → Display error, exit gracefully
- Timeout → Stop recording, prompt again
- No speech detected → "No speech detected, try again"

## Testing

### Unit Tests (via demo script)

```bash
# Test command parser
node src/conversation-demo.js parser

# Test state machine
node src/conversation-demo.js state

# Interactive testing
node src/conversation-demo.js interactive

# Scripted walkthrough
node src/conversation-demo.js scripted
```

### Integration Tests

```bash
# With mock data (no real scan)
node src/conversation-demo.js interactive

# With real scan (text mode)
node src/scan.js --file samples/bad-page.html --fix --interactive

# With real scan (voice mode)
node src/scan.js --url http://example.com --fix --interactive --voice --listen
```

## Performance Considerations

### Memory
- Stores all violations in memory (typically < 100 items)
- Stores interaction history (grows unbounded - consider limiting)
- Claude fix response stored once (can be large, 4-8KB)

### Latency
- Command parsing: < 1ms
- State updates: < 1ms
- Response generation: < 1ms
- TTS (espeak-ng): ~100-500ms per phrase
- STT (Vosk): 50-200ms after speech ends
- Claude API (fix generation): 2-5 seconds

### Optimization Opportunities
- Lazy-load fixes only when requested (don't generate all upfront)
- Cache parsed command patterns for faster lookup
- Limit history to last N interactions
- Pre-generate common responses

## Future Enhancements

### Natural Language Understanding
- More flexible command parsing (e.g., "tell me about the third violation")
- Context-aware responses (e.g., "fix this one" instead of just "fix")
- Multi-turn clarification ("Which critical issue? 1, 2, or 3?")

### Rich Interactions
- Bulk operations ("fix all critical issues")
- Filtering combinations ("show critical and serious")
- Export commands ("save these results to a file")
- Comparison ("how many more violations than last scan?")

### Voice Improvements
- Wake word detection (always listening, activated by "hey a11y agent")
- Interrupt/cancel commands (stop long TTS output)
- Voice feedback customization (pitch, speed, voice selection)
- Multi-language support

### AI Integration
- Per-violation fix generation (only fetch when requested)
- Conversational fix guidance ("walk me through fixing this")
- Code diff visualization
- Fix verification ("did that fix it?")

## Dependencies

### Core
- `chalk` - Terminal colors and formatting
- Node.js readline - Text input (built-in)

### Voice (Optional)
- `vosk` - Speech-to-text
- `mic` - Microphone input
- `espeak-ng` - Text-to-speech (system package)

### Integration
- `@axe-core/playwright` - Accessibility scanning
- `@anthropic-ai/sdk` - AI fix suggestions

## Design Principles

1. **Progressive Enhancement** - Works in text mode first, voice is optional
2. **Graceful Degradation** - Missing fixes/voice doesn't break core functionality
3. **Natural Language** - Multiple ways to express same intent
4. **Context Awareness** - State machine tracks user's position
5. **Error Tolerance** - Unknown commands don't crash, prompt for help
6. **Accessibility** - System designed to help blind users is itself accessible

## License

Part of a11y-agent project - MIT License
