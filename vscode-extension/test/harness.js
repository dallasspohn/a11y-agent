/**
 * Runs the *built bundle* against a stub of the vscode API.
 *
 * Testing dist/extension.js rather than src/ is deliberate: the risk worth
 * covering is the ESM-to-CJS interop that esbuild performs on lint-html.js.
 * A test that imported the source directly would bypass exactly that.
 *
 * This is not a substitute for pressing F5 and looking at the squiggles.
 */
const Module = require('node:module');
const path = require('node:path');

class Position {
  constructor(line, character) {
    this.line = line;
    this.character = character;
  }
}

class Range {
  constructor(startLine, startChar, endLine, endChar) {
    if (startLine instanceof Position) {
      this.start = startLine;
      this.end = startChar;
    } else {
      this.start = new Position(startLine, startChar);
      this.end = new Position(endLine, endChar);
    }
  }
}

class Diagnostic {
  constructor(range, message, severity) {
    this.range = range;
    this.message = message;
    this.severity = severity;
  }
}

class DiagnosticCollection {
  constructor() {
    this.store = new Map();
  }

  set(uri, diagnostics) {
    this.store.set(uri.toString(), diagnostics);
  }

  get(uri) {
    return this.store.get(uri.toString());
  }

  delete(uri) {
    this.store.delete(uri.toString());
  }

  dispose() {
    this.store.clear();
  }
}

const handlers = {};
const listen = (name) => (fn) => {
  (handlers[name] ||= []).push(fn);
  return { dispose() {} };
};

let settings = {};
const messages = [];
const commands = {};

const vscode = {
  Position,
  Range,
  Diagnostic,
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  DiagnosticRelatedInformation: class {
    constructor(location, message) {
      this.location = location;
      this.message = message;
    }
  },
  Location: class {
    constructor(uri, range) {
      this.uri = uri;
      this.range = range;
    }
  },
  Uri: {
    parse: (value) => ({ toString: () => value, fsPath: value }),
    file: (value) => ({ toString: () => `file://${value}`, fsPath: value }),
  },
  languages: {
    createDiagnosticCollection: () => new DiagnosticCollection(),
  },
  workspace: {
    textDocuments: [],
    getConfiguration: () => ({
      get: (key, fallback) => (key in settings ? settings[key] : fallback),
    }),
    onDidChangeTextDocument: listen('change'),
    onDidSaveTextDocument: listen('save'),
    onDidOpenTextDocument: listen('open'),
    onDidCloseTextDocument: listen('close'),
    onDidChangeConfiguration: listen('config'),
  },
  window: {
    activeTextEditor: undefined,
    showInformationMessage: (message) => messages.push(message),
  },
  commands: {
    registerCommand: (id, fn) => {
      commands[id] = fn;
      return { dispose() {} };
    },
  },
};

// Intercept require('vscode'), which only exists inside the real extension host.
const load = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return vscode;
  return load.apply(this, [request, parent, isMain]);
};

function makeDocument(text, fsPath = '/tmp/page.html', languageId = 'html') {
  return {
    languageId,
    uri: vscode.Uri.file(fsPath),
    getText: () => text,
    positionAt(offset) {
      const before = text.slice(0, offset);
      const lines = before.split('\n');
      return new Position(lines.length - 1, lines[lines.length - 1].length);
    },
  };
}

function loadExtension() {
  const entry = path.resolve(__dirname, '../dist/extension.js');
  delete require.cache[entry];
  return require(entry);
}

module.exports = {
  vscode,
  handlers,
  commands,
  messages,
  makeDocument,
  loadExtension,
  setSettings: (next) => {
    settings = next;
  },
  reset: () => {
    for (const key of Object.keys(handlers)) delete handlers[key];
    messages.length = 0;
    settings = {};
    vscode.workspace.textDocuments = [];
    vscode.window.activeTextEditor = undefined;
  },
};
