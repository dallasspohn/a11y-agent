/**
 * Runs inside a real VS Code extension host.
 *
 * The unit tests stub the editor API, so they prove the logic but not that the
 * extension activates, that the manifest is valid, or that diagnostics reach
 * the Problems panel. This does.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const vscode = require('vscode');

const SAMPLES = path.resolve(__dirname, '../../../../samples');
const EXTENSION_ID = 'shift-left-a11y.a11y-agent-vscode';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Diagnostics arrive asynchronously after the document opens.
async function diagnosticsFor(uri, { expectEmpty = false } = {}) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const found = vscode.languages.getDiagnostics(uri).filter((d) => d.source === 'a11y-agent');
    if (found.length > 0) return found;
    if (expectEmpty && attempt > 10) return [];
    await wait(100);
  }
  return vscode.languages.getDiagnostics(uri).filter((d) => d.source === 'a11y-agent');
}

async function open(name) {
  const uri = vscode.Uri.file(path.join(SAMPLES, name));
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document);
  return document;
}

suite('a11y-agent extension host', () => {
  test('extension is present and activates', async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `extension ${EXTENSION_ID} not found`);

    await open('bad-page.html');
    await extension.activate();
    assert.equal(extension.isActive, true);
  });

  test('bad-page.html gets diagnostics in the Problems panel', async () => {
    const document = await open('bad-page.html');
    const diagnostics = await diagnosticsFor(document.uri);

    assert.ok(diagnostics.length > 0, 'no diagnostics reached the Problems panel');
  });

  test('diagnostics point at the failing element', async () => {
    const document = await open('bad-page.html');
    const diagnostics = await diagnosticsFor(document.uri);
    const text = document.getText();

    for (const d of diagnostics) {
      const sliced = text.slice(document.offsetAt(d.range.start), document.offsetAt(d.range.end));
      assert.ok(
        sliced.startsWith('<'),
        `${d.code?.value ?? d.code} underlines "${sliced.slice(0, 30)}" instead of an element`,
      );
    }
  });

  test('image-alt is reported and links to WCAG', async () => {
    const document = await open('bad-page.html');
    const diagnostics = await diagnosticsFor(document.uri);

    const imageAlt = diagnostics.find((d) => (d.code?.value ?? d.code) === 'image-alt');
    assert.ok(imageAlt, 'expected an image-alt diagnostic');
    assert.ok(imageAlt.code.target, 'rule id should link to the WCAG page');
  });

  test('good-page.html is clean', async () => {
    const document = await open('good-page.html');
    const diagnostics = await diagnosticsFor(document.uri, { expectEmpty: true });

    assert.deepEqual(
      diagnostics.map((d) => d.code?.value ?? d.code),
      [],
    );
  });

  test('the scan command is registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('a11yAgent.scanDocument'), 'scan command not registered');
  });

  test('editing re-lints the document', async () => {
    const document = await open('bad-page.html');
    const before = (await diagnosticsFor(document.uri)).length;
    assert.ok(before > 0);

    const editor = await vscode.window.showTextDocument(document);
    await editor.edit((builder) => {
      builder.insert(new vscode.Position(0, 0), '<!-- edited -->\n');
    });

    await wait(1200); // debounce plus a margin
    const after = vscode.languages.getDiagnostics(document.uri).filter((d) => d.source === 'a11y-agent');
    assert.ok(after.length > 0, 'diagnostics vanished after an edit');

    // Leave the fixture untouched on disk.
    await vscode.commands.executeCommand('undo');
  });
});
