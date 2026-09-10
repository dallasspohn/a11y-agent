const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const harness = require('./harness.js');
const { vscode, handlers, commands, messages, makeDocument, loadExtension } = harness;

const BAD_PAGE = readFileSync(path.resolve(__dirname, '../../samples/bad-page.html'), 'utf8');
const GOOD_PAGE = readFileSync(path.resolve(__dirname, '../../samples/good-page.html'), 'utf8');

function activateWith(documents = [], settings = {}) {
  harness.reset();
  harness.setSettings(settings);
  vscode.workspace.textDocuments = documents;

  const context = { subscriptions: [] };
  const collections = [];
  const create = vscode.languages.createDiagnosticCollection;
  vscode.languages.createDiagnosticCollection = (...args) => {
    const collection = create(...args);
    collections.push(collection);
    return collection;
  };

  loadExtension().activate(context);
  vscode.languages.createDiagnosticCollection = create;

  return { context, collection: collections[0] };
}

const fire = (name, payload) => (handlers[name] || []).forEach((fn) => fn(payload));

beforeEach(() => harness.reset());

test('bundle loads and lints through the esbuild ESM interop', () => {
  const document = makeDocument(BAD_PAGE);
  const { collection } = activateWith([document]);

  const diagnostics = collection.get(document.uri);
  assert.ok(diagnostics.length > 0, 'expected violations from bad-page.html');
});

test('a clean document produces no diagnostics', () => {
  const document = makeDocument(GOOD_PAGE);
  const { collection } = activateWith([document]);

  assert.deepEqual(collection.get(document.uri), []);
});

test('diagnostic ranges stay inside the document', () => {
  const document = makeDocument(BAD_PAGE);
  const { collection } = activateWith([document]);

  const lines = BAD_PAGE.split('\n');
  for (const d of collection.get(document.uri)) {
    assert.ok(d.range.start.line < lines.length, `start line ${d.range.start.line} past EOF`);
    assert.ok(d.range.end.line < lines.length, `end line ${d.range.end.line} past EOF`);
    assert.ok(
      d.range.end.line > d.range.start.line || d.range.end.character >= d.range.start.character,
      'end before start',
    );
  }
});

test('the squiggle covers the element that actually failed', () => {
  const html = ['<html lang="en">', '<body>', '  <img src="logo.png">', '</body>', '</html>'].join('\n');
  const document = makeDocument(html);
  const { collection } = activateWith([document]);

  const imageAlt = collection.get(document.uri).find((d) => (d.code.value ?? d.code) === 'image-alt');
  assert.ok(imageAlt, 'expected an image-alt diagnostic');
  assert.equal(imageAlt.range.start.line, 2);
  assert.equal(imageAlt.range.start.character, 2);
  assert.equal(imageAlt.range.end.character, 22, 'should end at the closing bracket');
});

test('rule id links to the WCAG explanation', () => {
  const document = makeDocument(BAD_PAGE);
  const { collection } = activateWith([document]);

  const [first] = collection.get(document.uri);
  assert.ok(first.code.target, 'rule id should be a link');
  assert.match(first.code.target.toString(), /^https:\/\/www\.w3\.org\//);
});

test('nothing is reported as an Error', () => {
  const document = makeDocument(BAD_PAGE);
  const { collection } = activateWith([document]);

  for (const d of collection.get(document.uri)) {
    assert.notEqual(d.severity, vscode.DiagnosticSeverity.Error, `${d.code.value} reported as Error`);
  }
});

test('minimumImpact filters out lower-impact rules', () => {
  const document = makeDocument(BAD_PAGE);

  const all = activateWith([document], { minimumImpact: 'minor' }).collection.get(document.uri);
  const criticalOnly = activateWith([document], { minimumImpact: 'critical' }).collection.get(document.uri);

  assert.ok(criticalOnly.length < all.length, 'filter should reduce the count');
  assert.ok(criticalOnly.length > 0, 'bad-page has critical violations');
});

test('non-html documents are ignored', () => {
  const document = makeDocument('# not html', '/tmp/notes.md', 'markdown');
  const { collection } = activateWith([document]);

  assert.equal(collection.get(document.uri), undefined);
});

test('malformed markup does not throw', () => {
  for (const html of ['', '<div><img src=x', '<<<>>>', '<p>unclosed']) {
    const document = makeDocument(html);
    assert.doesNotThrow(() => activateWith([document]));
  }
});

test('closing a document clears its diagnostics', () => {
  const document = makeDocument(BAD_PAGE);
  const { collection } = activateWith([document]);
  assert.ok(collection.get(document.uri).length > 0);

  fire('close', document);
  assert.equal(collection.get(document.uri), undefined);
});

test('manual mode does not lint on save', () => {
  const document = makeDocument(BAD_PAGE);
  const { collection } = activateWith([], { run: 'manual' });

  fire('save', document);
  assert.equal(collection.get(document.uri), undefined);
});

test('save lints when run is onSave', () => {
  const document = makeDocument(BAD_PAGE);
  const { collection } = activateWith([], { run: 'onSave' });

  fire('save', document);
  assert.ok(collection.get(document.uri).length > 0);
});

test('the scan command reports a count', () => {
  const document = makeDocument(BAD_PAGE);
  activateWith([], { run: 'manual' });
  vscode.window.activeTextEditor = { document };

  commands['a11yAgent.scanDocument']();
  assert.match(messages.at(-1), /\d+ accessibility violations found/);
});

test('the scan command says so when the page is clean', () => {
  const document = makeDocument(GOOD_PAGE);
  activateWith([], { run: 'manual' });
  vscode.window.activeTextEditor = { document };

  commands['a11yAgent.scanDocument']();
  assert.match(messages.at(-1), /no accessibility violations/);
});
