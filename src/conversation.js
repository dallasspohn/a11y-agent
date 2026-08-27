import chalk from 'chalk';

/**
 * Conversation Navigation System for a11y-agent
 *
 * Enables natural language interaction with accessibility scan results.
 * Supports voice commands via TTS/STT integration.
 */

// Conversation states
export const States = {
  SUMMARY: 'summary',                     // Initial state showing scan overview
  BROWSING_VIOLATIONS: 'browsing',        // Navigating through violations
  SHOWING_VIOLATION: 'showing_violation', // Displaying current violation details
  SHOWING_FIX: 'showing_fix',             // Displaying AI-generated fix
  SHOWING_CODE: 'showing_code',           // Displaying HTML snippet
  ASKING_CATEGORY: 'asking_category',     // Asking which category to focus on
  DONE: 'done',                           // Session ended
};

// Impact levels in priority order
const IMPACT_LEVELS = ['critical', 'serious', 'moderate', 'minor'];

/**
 * ConversationState - manages state for interactive navigation
 */
export class ConversationState {
  constructor(violations = [], fixes = null) {
    this.violations = violations;
    this.fixes = fixes;
    this.state = States.SUMMARY;
    this.currentIndex = 0;
    this.currentCategory = null;
    this.lastResponse = '';
    this.history = [];

    // Group violations by impact level
    this.violationsByImpact = this._groupByImpact(violations);

    // Create flattened list for navigation (sorted by impact)
    this.sortedViolations = this._sortViolations(violations);
  }

  _groupByImpact(violations) {
    const grouped = {
      critical: [],
      serious: [],
      moderate: [],
      minor: [],
    };

    violations.forEach(v => {
      if (grouped[v.impact]) {
        grouped[v.impact].push(v);
      }
    });

    return grouped;
  }

  _sortViolations(violations) {
    return [...violations].sort((a, b) => {
      const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
      return (order[a.impact] ?? 4) - (order[b.impact] ?? 4);
    });
  }

  getCurrentViolation() {
    if (this.currentCategory) {
      const categoryViolations = this.violationsByImpact[this.currentCategory];
      return categoryViolations[this.currentIndex] || null;
    }
    return this.sortedViolations[this.currentIndex] || null;
  }

  getViolationList() {
    if (this.currentCategory) {
      return this.violationsByImpact[this.currentCategory];
    }
    return this.sortedViolations;
  }

  moveNext() {
    const list = this.getViolationList();
    if (this.currentIndex < list.length - 1) {
      this.currentIndex++;
      return true;
    }
    return false;
  }

  movePrevious() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      return true;
    }
    return false;
  }

  jumpToCategory(category) {
    if (this.violationsByImpact[category]?.length > 0) {
      this.currentCategory = category;
      this.currentIndex = 0;
      return true;
    }
    return false;
  }

  resetCategory() {
    this.currentCategory = null;
    this.currentIndex = 0;
  }

  getSummary() {
    const summary = {
      total: this.violations.length,
      critical: this.violationsByImpact.critical.length,
      serious: this.violationsByImpact.serious.length,
      moderate: this.violationsByImpact.moderate.length,
      minor: this.violationsByImpact.minor.length,
    };
    return summary;
  }

  recordInteraction(command, response) {
    this.lastResponse = response;
    this.history.push({ command, response, timestamp: Date.now() });
  }
}

/**
 * Command parser - maps natural language to actions
 */
export class CommandParser {
  static COMMANDS = {
    // Navigation
    NEXT: ['next', 'continue', 'next violation', 'next one', 'skip'],
    PREVIOUS: ['previous', 'go back', 'last one', 'back', 'prev'],

    // Category jumps
    CRITICAL: ['critical', 'show critical', 'critical issues', 'critical violations'],
    SERIOUS: ['serious', 'show serious', 'serious issues', 'serious violations'],
    MODERATE: ['moderate', 'show moderate', 'moderate issues', 'moderate violations'],
    MINOR: ['minor', 'show minor', 'minor issues', 'minor violations'],
    ALL: ['all', 'show all', 'all violations', 'all issues', 'everything'],

    // Details
    FIX: ['fix', 'how do i fix', 'how to fix', 'show fix', 'fix this', 'solution', 'repair'],
    CODE: ['code', 'show code', 'html', 'show html', 'source', 'show source'],
    DETAILS: ['details', 'more details', 'tell me more', 'explain', 'what is this'],

    // Utility
    REPEAT: ['repeat', 'say again', 'what', 'say that again', 'pardon'],
    HELP: ['help', 'what can i say', 'commands', 'options'],
    SUMMARY: ['summary', 'overview', 'show summary', 'start over'],
    DONE: ['done', 'exit', 'quit', 'finish', 'stop', 'bye', 'goodbye'],
  };

  static parse(input) {
    const normalized = input.toLowerCase().trim();

    // Check each command pattern
    for (const [command, patterns] of Object.entries(this.COMMANDS)) {
      for (const pattern of patterns) {
        if (normalized === pattern || normalized.includes(pattern)) {
          return command;
        }
      }
    }

    // Check for numeric input (violation number)
    const numberMatch = normalized.match(/^(?:number |violation |issue )?(\d+)$/);
    if (numberMatch) {
      return { command: 'GOTO', value: parseInt(numberMatch[1]) - 1 }; // 0-indexed
    }

    return 'UNKNOWN';
  }
}

/**
 * Response generator - creates text/voice output based on state
 */
export class ResponseGenerator {
  static generateSummary(state) {
    const summary = state.getSummary();

    if (summary.total === 0) {
      return {
        text: chalk.green.bold('No accessibility violations detected. Great job!'),
        speech: 'No accessibility violations detected. Great job!',
        nextState: States.DONE,
      };
    }

    const parts = [
      chalk.bold('\nA11Y SCAN COMPLETE'),
      `\n${summary.total} violation${summary.total !== 1 ? 's' : ''} found:`,
      summary.critical > 0 ? chalk.bgRed.white.bold(` ${summary.critical} critical `) : null,
      summary.serious > 0 ? chalk.red.bold(`${summary.serious} serious`) : null,
      summary.moderate > 0 ? chalk.yellow(`${summary.moderate} moderate`) : null,
      summary.minor > 0 ? chalk.dim(`${summary.minor} minor`) : null,
    ].filter(Boolean);

    const text = parts.join(' ');

    const speechParts = [
      `Scan complete. ${summary.total} violations found.`,
      summary.critical > 0 ? `${summary.critical} critical.` : null,
      summary.serious > 0 ? `${summary.serious} serious.` : null,
      summary.moderate > 0 ? `${summary.moderate} moderate.` : null,
      summary.minor > 0 ? `${summary.minor} minor.` : null,
      '\nWhat would you like to focus on?',
    ].filter(Boolean).join(' ');

    return {
      text: text + chalk.dim('\n\nWhat would you like to focus on?'),
      speech: speechParts,
      nextState: States.ASKING_CATEGORY,
    };
  }

  static generateViolationDetail(state) {
    const violation = state.getCurrentViolation();

    if (!violation) {
      return {
        text: chalk.yellow('No more violations in this category.'),
        speech: 'No more violations in this category.',
        nextState: States.BROWSING_VIOLATIONS,
      };
    }

    const list = state.getViolationList();
    const position = `${state.currentIndex + 1} of ${list.length}`;
    const category = state.currentCategory || 'all';

    const impactColors = {
      critical: chalk.bgRed.white.bold,
      serious: chalk.red.bold,
      moderate: chalk.yellow,
      minor: chalk.dim,
    };

    const colorFn = impactColors[violation.impact] || chalk.white;

    const parts = [
      chalk.bold(`\n[${position}] ${category.toUpperCase()}`),
      colorFn(`\n${violation.impact.toUpperCase()}: ${violation.id}`),
      chalk.white(`\n${violation.help}`),
      chalk.dim(`\nAffects ${violation.nodes.length} element${violation.nodes.length !== 1 ? 's' : ''}`),
      chalk.dim('\n\nSay "fix" for solution, "code" to see HTML, "next" to continue'),
    ];

    const speech = [
      `Violation ${state.currentIndex + 1} of ${list.length}.`,
      `${violation.impact} issue.`,
      violation.help,
      `Affects ${violation.nodes.length} element${violation.nodes.length !== 1 ? 's' : ''}.`,
    ].join(' ');

    return {
      text: parts.join(''),
      speech,
      nextState: States.SHOWING_VIOLATION,
    };
  }

  static generateFixSuggestion(state, fixes) {
    const violation = state.getCurrentViolation();

    if (!violation) {
      return {
        text: chalk.yellow('No current violation selected.'),
        speech: 'No current violation selected.',
        nextState: state.state,
      };
    }

    if (!fixes) {
      return {
        text: chalk.yellow('No fix suggestions available. Run with --fix flag to generate AI suggestions.'),
        speech: 'No fix suggestions available. Run with the fix flag to generate AI suggestions.',
        nextState: state.state,
      };
    }

    // Extract fix for this specific violation from Claude's response
    // This is a simplified approach - in practice, you'd parse the structured fixes
    const fixText = chalk.blue.bold('\nAI FIX SUGGESTION:\n') +
                   chalk.dim('(See full output for detailed fixes)\n') +
                   chalk.white(`\nFor: ${violation.id}\n`) +
                   chalk.dim(violation.help);

    const speech = `Fix suggestion for ${violation.id}. See output for detailed code changes.`;

    return {
      text: fixText,
      speech,
      nextState: States.SHOWING_FIX,
    };
  }

  static generateCodeSnippet(state) {
    const violation = state.getCurrentViolation();

    if (!violation || !violation.nodes.length) {
      return {
        text: chalk.yellow('No code available for this violation.'),
        speech: 'No code available for this violation.',
        nextState: state.state,
      };
    }

    const parts = [chalk.bold('\nHTML CODE:')];

    violation.nodes.slice(0, 3).forEach((node, idx) => {
      parts.push(chalk.cyan(`\nElement ${idx + 1}: ${node.target.join(', ')}`));
      parts.push(chalk.white(node.html || '(no HTML snippet)'));
    });

    if (violation.nodes.length > 3) {
      parts.push(chalk.dim(`\n... and ${violation.nodes.length - 3} more elements`));
    }

    const speech = `Showing code for ${violation.nodes.length} affected element${violation.nodes.length !== 1 ? 's' : ''}.`;

    return {
      text: parts.join(''),
      speech,
      nextState: States.SHOWING_CODE,
    };
  }

  static generateHelp() {
    const helpText = chalk.bold('\nAVAILABLE COMMANDS:\n') + [
      chalk.cyan('Navigation:') + ' next, previous, done',
      chalk.cyan('Categories:') + ' critical, serious, moderate, minor, all',
      chalk.cyan('Details:') + ' fix, code, details',
      chalk.cyan('Utility:') + ' repeat, help, summary',
    ].join('\n');

    const speech = 'Available commands: next, previous, critical, serious, moderate, minor, fix, code, details, repeat, help, summary, and done.';

    return {
      text: helpText,
      speech,
      nextState: null, // Stay in current state
    };
  }

  static generateUnknownCommand() {
    return {
      text: chalk.yellow('\nI did not understand that command. Say "help" for options.'),
      speech: 'I did not understand that command. Say help for options.',
      nextState: null,
    };
  }

  static generateDone() {
    return {
      text: chalk.green.bold('\nAccessibility review complete. Goodbye!'),
      speech: 'Accessibility review complete. Goodbye!',
      nextState: States.DONE,
    };
  }
}

/**
 * Main handler - processes user input and updates state
 */
export function handleUserInput(input, state) {
  const command = CommandParser.parse(input);

  // Handle numeric goto
  if (typeof command === 'object' && command.command === 'GOTO') {
    const list = state.getViolationList();
    if (command.value >= 0 && command.value < list.length) {
      state.currentIndex = command.value;
      const response = ResponseGenerator.generateViolationDetail(state);
      state.state = response.nextState || state.state;
      state.recordInteraction(input, response.text);
      return response;
    } else {
      const response = {
        text: chalk.yellow(`Violation number ${command.value + 1} does not exist.`),
        speech: `Violation number ${command.value + 1} does not exist.`,
        nextState: null,
      };
      state.recordInteraction(input, response.text);
      return response;
    }
  }

  // Handle text commands
  let response;

  switch (command) {
    case 'NEXT':
      if (state.moveNext()) {
        response = ResponseGenerator.generateViolationDetail(state);
      } else {
        response = {
          text: chalk.yellow('No more violations. Say "summary" to review or "done" to exit.'),
          speech: 'No more violations. Say summary to review or done to exit.',
          nextState: null,
        };
      }
      break;

    case 'PREVIOUS':
      if (state.movePrevious()) {
        response = ResponseGenerator.generateViolationDetail(state);
      } else {
        response = {
          text: chalk.yellow('Already at first violation.'),
          speech: 'Already at first violation.',
          nextState: null,
        };
      }
      break;

    case 'CRITICAL':
    case 'SERIOUS':
    case 'MODERATE':
    case 'MINOR':
      const category = command.toLowerCase();
      if (state.jumpToCategory(category)) {
        response = ResponseGenerator.generateViolationDetail(state);
      } else {
        response = {
          text: chalk.yellow(`No ${category} violations found.`),
          speech: `No ${category} violations found.`,
          nextState: null,
        };
      }
      break;

    case 'ALL':
      state.resetCategory();
      response = ResponseGenerator.generateViolationDetail(state);
      break;

    case 'FIX':
      response = ResponseGenerator.generateFixSuggestion(state, state.fixes);
      break;

    case 'CODE':
      response = ResponseGenerator.generateCodeSnippet(state);
      break;

    case 'DETAILS':
      response = ResponseGenerator.generateViolationDetail(state);
      break;

    case 'REPEAT':
      response = {
        text: state.lastResponse,
        speech: state.lastResponse,
        nextState: null,
      };
      break;

    case 'HELP':
      response = ResponseGenerator.generateHelp();
      break;

    case 'SUMMARY':
      state.resetCategory();
      response = ResponseGenerator.generateSummary(state);
      break;

    case 'DONE':
      response = ResponseGenerator.generateDone();
      break;

    default:
      response = ResponseGenerator.generateUnknownCommand();
  }

  // Update state
  if (response.nextState !== null) {
    state.state = response.nextState;
  }

  state.recordInteraction(input, response.text);
  return response;
}

/**
 * Generate initial response based on state
 */
export function generateResponse(state) {
  switch (state.state) {
    case States.SUMMARY:
      return ResponseGenerator.generateSummary(state);

    case States.BROWSING_VIOLATIONS:
    case States.SHOWING_VIOLATION:
      return ResponseGenerator.generateViolationDetail(state);

    case States.ASKING_CATEGORY:
      return {
        text: chalk.dim('Say a category (critical, serious, moderate, minor) or "all" to begin.'),
        speech: 'Say a category like critical, serious, moderate, minor, or all to begin.',
        nextState: null,
      };

    case States.DONE:
      return ResponseGenerator.generateDone();

    default:
      return ResponseGenerator.generateSummary(state);
  }
}

/**
 * Start interactive conversation mode
 * Integrates with voice commands and TTS
 */
export async function startConversation(violations, fixes, options = {}) {
  const { voice = false, tts = null, stt = null } = options;

  const state = new ConversationState(violations, fixes);

  // Generate and display initial summary
  const initialResponse = generateResponse(state);
  console.log(initialResponse.text);

  if (voice && tts) {
    await tts(initialResponse.speech);
  }

  // If voice mode, listen for commands
  if (voice && stt) {
    while (state.state !== States.DONE) {
      try {
        const input = await stt();
        console.log(chalk.dim(`\n[You said: "${input}"]`));

        const response = handleUserInput(input, state);
        console.log(response.text);

        if (tts) {
          await tts(response.speech);
        }

        if (state.state === States.DONE) {
          break;
        }
      } catch (err) {
        console.error(chalk.red(`Error: ${err.message}`));
        break;
      }
    }
  }

  return state;
}
