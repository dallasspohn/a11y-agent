const vscode = require('vscode');
const { lintHtml } = require('../../src/lib/lint-html.js');

const SOURCE = 'a11y-agent';

// axe impact -> editor severity. Nothing maps to Error: a11y violations should
// not read as louder than a syntax error in the same file.
const SEVERITY = {
  critical: vscode.DiagnosticSeverity.Warning,
  serious: vscode.DiagnosticSeverity.Warning,
  moderate: vscode.DiagnosticSeverity.Information,
  minor: vscode.DiagnosticSeverity.Hint,
};

const IMPACT_ORDER = ['minor', 'moderate', 'serious', 'critical'];

function config() {
  return vscode.workspace.getConfiguration('a11yAgent');
}

/**
 * Violation range -> vscode.Range.
 *
 * lintHtml gives 0-based line/column, which is what vscode.Position wants, but
 * the offsets come from a parse of text that may already be stale by the time
 * we get here. Re-derive from the live document so a squiggle can never point
 * past the end of the buffer.
 */
function toRange(document, range) {
  if (!range) return new vscode.Range(0, 0, 0, 0);

  const max = document.getText().length;
  const start = document.positionAt(Math.min(range.start.offset, max));
  const end = document.positionAt(Math.min(range.end.offset, max));
  return new vscode.Range(start, end);
}

function toDiagnostic(document, violation) {
  const node = violation.nodes[0];
  const diagnostic = new vscode.Diagnostic(
    toRange(document, node.range),
    violation.help,
    SEVERITY[violation.impact] ?? vscode.DiagnosticSeverity.Information,
  );

  diagnostic.source = SOURCE;
  // Clicking the rule id opens the WCAG explanation — the "why", which is the
  // part developers actually need and the part a bare rule name never gives.
  diagnostic.code = violation.helpUrl
    ? { value: violation.id, target: vscode.Uri.parse(violation.helpUrl) }
    : violation.id;

  const summary = node.failureSummary;
  if (summary && summary !== violation.help) {
    diagnostic.relatedInformation = [
      new vscode.DiagnosticRelatedInformation(
        new vscode.Location(document.uri, diagnostic.range),
        summary,
      ),
    ];
  }

  return diagnostic;
}

function lintDocument(document, collection) {
  if (document.languageId !== 'html') return;

  const floor = IMPACT_ORDER.indexOf(config().get('minimumImpact', 'minor'));

  let violations;
  try {
    violations = lintHtml(document.getText(), document.uri.fsPath);
  } catch (error) {
    // A half-typed document must never surface a parser stack trace. Drop the
    // stale squiggles and wait for the next keystroke to make it parseable.
    console.error(`${SOURCE}: lint failed`, error);
    collection.delete(document.uri);
    return;
  }

  const diagnostics = violations
    .filter((v) => IMPACT_ORDER.indexOf(v.impact) >= floor)
    .map((v) => toDiagnostic(document, v));

  collection.set(document.uri, diagnostics);
}

function activate(context) {
  const collection = vscode.languages.createDiagnosticCollection(SOURCE);
  context.subscriptions.push(collection);

  const timers = new Map();

  const schedule = (document) => {
    const key = document.uri.toString();
    clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        lintDocument(document, collection);
      }, config().get('debounceMs', 300)),
    );
  };

  const lintOpenDocuments = () => {
    for (const document of vscode.workspace.textDocuments) {
      lintDocument(document, collection);
    }
  };

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (config().get('run') === 'onType') schedule(event.document);
    }),

    vscode.workspace.onDidSaveTextDocument((document) => {
      if (config().get('run') !== 'manual') lintDocument(document, collection);
    }),

    vscode.workspace.onDidOpenTextDocument((document) => {
      if (config().get('run') !== 'manual') lintDocument(document, collection);
    }),

    // Diagnostics for a closed file linger in the Problems panel otherwise.
    vscode.workspace.onDidCloseTextDocument((document) => {
      const key = document.uri.toString();
      clearTimeout(timers.get(key));
      timers.delete(key);
      collection.delete(document.uri);
    }),

    // Changing minimumImpact should take effect now, not on the next keystroke.
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('a11yAgent')) lintOpenDocuments();
    }),

    vscode.commands.registerCommand('a11yAgent.scanDocument', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      lintDocument(editor.document, collection);
      const count = (collection.get(editor.document.uri) || []).length;
      vscode.window.showInformationMessage(
        count === 0
          ? 'A11Y Agent: no accessibility violations found.'
          : `A11Y Agent: ${count} accessibility ${count === 1 ? 'violation' : 'violations'} found.`,
      );
    }),
  );

  lintOpenDocuments();

  context.subscriptions.push({
    dispose: () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    },
  });
}

function deactivate() {}

module.exports = { activate, deactivate };
