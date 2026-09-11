import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { normalizeSpokenTarget, parseVoiceCommand } from '../src/voice-commands.js';

// Every alias the docs promise has to land on a file that is actually in the
// repo. docs/tutorial.md walks a judge through a spoken session; an alias that
// resolves to a missing fixture breaks the demo, not just a test.
test('demo aliases resolve to files that exist', () => {
  for (const spoken of [
    'bad page', 'the bad page', 'sample page',
    'good page', 'the good page',
    'web page', 'the web page',
    'current page', 'the current page',
    'current web page', 'the current web page',
  ]) {
    const path = normalizeSpokenTarget(spoken);
    assert.ok(existsSync(path), `"${spoken}" -> ${path} (missing)`);
  }
});

test('aliases point at the page the wording implies', () => {
  assert.equal(normalizeSpokenTarget('the bad page'), 'samples/bad-page.html');
  assert.equal(normalizeSpokenTarget('the good page'), 'samples/good-page.html');
  assert.equal(normalizeSpokenTarget('the current web page'), 'samples/web-page.html');
});

// The small Vosk model drops and mangles words, so the distinguishing term has
// to carry the match on its own.
test('mistranscriptions still find the right page', () => {
  assert.equal(normalizeSpokenTarget('scan the bat pages'), 'samples/bad-page.html');
  assert.equal(normalizeSpokenTarget('a wed page'), 'samples/web-page.html');
  assert.equal(normalizeSpokenTarget('current paige'), 'samples/web-page.html');
});

// Regression: "current page" used to fall through to the token join and come
// back as the path "currentpage", which the agent then spoke as "I could not
// find a file called currentpage" — naming something the user never said.
test('unrecognized speech is not turned into a filename', () => {
  assert.equal(normalizeSpokenTarget('the login form'), 'the login form');
  assert.ok(!normalizeSpokenTarget('the login form').includes('loginform'));
});

// Dictated paths and domains are the one case where joining is correct.
test('spelled-out paths and domains still join', () => {
  assert.equal(
    normalizeSpokenTarget('samples slash bad dash page dot html'),
    'samples/bad-page.html',
  );
  assert.equal(normalizeSpokenTarget('red hat dot com'), 'redhat.com');
});

test('spoken domains become URLs, aliases become files', () => {
  assert.equal(parseVoiceCommand('scan red hat dot com').url, 'https://redhat.com');
  assert.equal(parseVoiceCommand('scan the current web page').file, 'samples/web-page.html');
});

// Vosk regularly swallows the leading verb.
test('a bare page name works without the verb', () => {
  assert.equal(parseVoiceCommand('the current web page').file, 'samples/web-page.html');
  assert.equal(parseVoiceCommand('the bad page').file, 'samples/bad-page.html');
});

test('ordinary speech is never mistaken for a scan target', () => {
  assert.equal(parseVoiceCommand('what time is it').file, undefined);
  assert.equal(parseVoiceCommand('what time is it').url, undefined);
});
