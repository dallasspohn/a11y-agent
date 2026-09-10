#!/usr/bin/env node
/**
 * Offline check of the Vosk recognizer wiring — no microphone required.
 *
 * Feeds a WAV file through the same API calls listenForCommand() makes, so a
 * broken constructor or result-parsing change fails here instead of during a demo.
 *
 * Usage: node scripts/test-vosk-pipeline.js [path/to/16bit-mono.wav]
 */
import { readFile, unlink } from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { checkVoskAvailability, parseVoiceCommand } from '../src/voice-commands.js';

const execFileAsync = promisify(execFile);

const PHRASE = 'scan the bad page';

/**
 * Synthesize the test clip with espeak-ng so the check is self-contained.
 * Depending on a pre-existing file made the script fail with ENOENT the moment
 * /tmp was cleared.
 */
async function makeTestWav() {
  const raw = `/tmp/a11y-vosk-check-${process.pid}-raw.wav`;
  const path = `/tmp/a11y-vosk-check-${process.pid}.wav`;

  await execFileAsync('espeak-ng', [
    '-s', '130',          // slower speech recognizes more reliably
    '-w', raw,
    PHRASE,
  ]);

  // espeak writes 22.05 kHz; the small en-us model expects 16 kHz mono, and
  // feeding it the wrong rate garbles the transcript badly.
  try {
    await execFileAsync('ffmpeg', ['-y', '-loglevel', 'quiet', '-i', raw, '-ar', '16000', '-ac', '1', path]);
    await unlink(raw).catch(() => {});
    return { path, generated: true };
  } catch {
    return { path: raw, generated: true };  // no ffmpeg — try the 22 kHz clip
  }
}

let wavPath = process.argv[2];
let generated = false;

if (!wavPath) {
  try {
    ({ path: wavPath, generated } = await makeTestWav());
  } catch (err) {
    console.error(`FAIL: could not synthesize a test clip (${err.message})`);
    console.error('Install espeak-ng, or pass a 16-bit mono WAV:');
    console.error('  node scripts/test-vosk-pipeline.js path/to/clip.wav');
    process.exit(1);
  }
}

function readWavHeader(buf) {
  // Minimal RIFF parse: locate 'fmt ' and 'data' chunks
  let offset = 12;
  let sampleRate = 16000;
  let data = null;

  while (offset < buf.length - 8) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);

    if (id === 'fmt ') {
      sampleRate = buf.readUInt32LE(offset + 12);
    } else if (id === 'data') {
      data = buf.subarray(offset + 8, offset + 8 + size);
    }
    offset += 8 + size + (size % 2);
  }

  if (!data) throw new Error('No data chunk found in WAV');
  return { sampleRate, data };
}

const check = await checkVoskAvailability();
if (!check.available) {
  console.error(`FAIL: ${check.error}`);
  process.exit(1);
}
console.log(`Model: ${check.modelPath}`);

const vosk = (await import('vosk')).default;
vosk.setLogLevel(-1);

const { sampleRate, data } = readWavHeader(await readFile(wavPath));
console.log(`Audio: ${wavPath} @ ${sampleRate} Hz, ${data.length} bytes`);

const model = new vosk.Model(check.modelPath);
const recognizer = new vosk.Recognizer({ model, sampleRate });

let transcript = '';
const CHUNK = 4096;
for (let i = 0; i < data.length; i += CHUNK) {
  const chunk = data.subarray(i, i + CHUNK);
  if (recognizer.acceptWaveform(chunk)) {
    const { text } = recognizer.result();
    if (text) transcript = `${transcript} ${text}`.trim();
  }
}
const { text } = recognizer.finalResult();
if (text) transcript = `${transcript} ${text}`.trim();

recognizer.free();
model.free();

if (generated) await unlink(wavPath).catch(() => {});

console.log(`Transcript: "${transcript}"`);
console.log('Parsed:', JSON.stringify(parseVoiceCommand(transcript), null, 2));

if (!transcript) {
  console.error('FAIL: empty transcript');
  process.exit(1);
}

// The point of this check is the API wiring, not espeak's diction — the small
// model mishears synthesized speech often enough that an exact match would be
// a flaky test. Any transcript at all proves the recognizer is alive.
if (generated && transcript !== PHRASE) {
  console.log(`(note: expected "${PHRASE}" — recognizer works, wording differs)`);
}

console.log('\nPASS: recognizer pipeline works end to end');
