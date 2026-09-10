import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';

import { speak as ttsSpeak } from './lib/tts.js';

const execAsync = promisify(exec);

/**
 * Voice command parser for a11y-agent
 * Maps spoken commands to CLI arguments
 */

const BEEP_RATE = 16000;

/**
 * ALSA capture device for speech input.
 *
 * 'default' routes through PipeWire/PulseAudio, which mixes inputs, so the mic
 * can be shared with a screen recorder. Set A11Y_MIC_DEVICE to a raw device
 * (e.g. 'plughw:1,0') only if you need to bypass the sound server.
 */
export const MIC_DEVICE = process.env.A11Y_MIC_DEVICE || 'default';

/**
 * Play a short tone for listening state changes.
 *
 * Synthesizes the PCM directly and pipes it to aplay so the duration is exact.
 * The old `beep`/`speaker-test` approach ignored the duration entirely
 * (speaker-test plays a full loop), producing a ~1s tone before recording.
 *
 * Fire-and-forget by design — awaiting this would delay the mic start.
 * Set A11Y_NO_BEEP=1 to silence, A11Y_BEEP_MS to change the length.
 */
function playBeep(frequency = 800, durationMs = Number(process.env.A11Y_BEEP_MS) || 70) {
  if (process.env.A11Y_NO_BEEP === '1' || durationMs <= 0) return;

  const samples = Math.floor((BEEP_RATE * durationMs) / 1000);
  const pcm = Buffer.alloc(samples * 2);
  // Fade the edges so the tone doesn't click
  const fade = Math.min(Math.floor(samples * 0.2), 160);

  for (let i = 0; i < samples; i++) {
    let gain = 0.25;
    if (i < fade) gain *= i / fade;
    else if (i > samples - fade) gain *= (samples - i) / fade;
    pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * frequency * i) / BEEP_RATE) * gain * 32767), i * 2);
  }

  try {
    const player = spawn(
      'aplay',
      ['-q', '-f', 'S16_LE', '-r', String(BEEP_RATE), '-c', '1', '-t', 'raw', '-'],
      { stdio: ['pipe', 'ignore', 'ignore'] }
    );
    // Audio feedback is nice-to-have — never let it break the command flow
    player.on('error', () => {});
    player.stdin.on('error', () => {});
    player.stdin.end(pcm);
  } catch {
    // Silent fail
  }
}

/**
 * Speak an announcement through the shared TTS module.
 *
 * This used to shell out to espeak-ng directly, which meant the listening
 * prompts spoke in a different (robotic) voice than the rest of the agent.
 * Routing through lib/tts.js keeps one voice for the whole conversation.
 */
async function speak(text, voiceOptions = {}) {
  return ttsSpeak(text, voiceOptions);
}

// Speech-to-text emits words, never punctuation — "red hat dot com" has to be
// reassembled into "redhat.com" before it can be used as a target.
const SPOKEN_SYMBOLS = {
  dot: '.', point: '.', period: '.',
  slash: '/', backslash: '\\',
  dash: '-', hyphen: '-', minus: '-',
  underscore: '_', colon: ':', tilde: '~',
};

// Short spoken names for demo targets the small Vosk model can't transcribe
// as literal paths ("samples/bad-page.html" never comes through intact).
const TARGET_ALIASES = {
  'bad page': 'samples/bad-page.html',
  'the bad page': 'samples/bad-page.html',
  'sample page': 'samples/bad-page.html',
  'good page': 'samples/good-page.html',
  'the good page': 'samples/good-page.html',
  'web page': 'samples/web-page.html',
  'the web page': 'samples/web-page.html',
};

// The small Vosk model rarely returns an alias verbatim — "bad page" comes back
// as "bad file", "bat page", "the bad pages". Enumerating every mistranscription
// is hopeless, so match on the distinguishing word instead. Only consulted when
// the phrase isn't dictating a literal path or domain.
const FUZZY_ALIASES = [
  { match: /\b(bad|bat|bed|bab)\b/, path: 'samples/bad-page.html' },
  { match: /\bgood\b/, path: 'samples/good-page.html' },
  { match: /\b(web|webb|wed|whip)\b/, path: 'samples/web-page.html' },
];

const KNOWN_TLDS = new Set([
  'com', 'org', 'net', 'io', 'dev', 'edu', 'gov', 'co', 'ai', 'app', 'us',
]);

function looksLikeDomain(target) {
  const host = target.split('/')[0];
  const parts = host.split('.');
  return parts.length > 1 && KNOWN_TLDS.has(parts[parts.length - 1]);
}

/**
 * Convert a spoken target phrase into a usable URL or file path.
 *
 * "red hat dot com"                  → "redhat.com"
 * "samples slash bad dash page dot html" → "samples/bad-page.html"
 * "the bad page"                     → "samples/bad-page.html" (alias)
 */
export function normalizeSpokenTarget(raw) {
  const spoken = raw.trim().toLowerCase().replace(/\s+/g, ' ');

  if (TARGET_ALIASES[spoken]) return TARGET_ALIASES[spoken];

  // Already a well-formed target (typed input, or a single unbroken token)
  if (/^(https?|file):\/\//.test(spoken) || !spoken.includes(' ')) return spoken;

  // "dot"/"slash" mean the user is spelling out a real path or domain, so take
  // them literally. Otherwise fall back to keyword matching on the demo pages —
  // without this, "scan bad file" silently becomes the path "badfile".
  if (!/\b(dot|slash|backslash)\b/.test(spoken)) {
    const fuzzy = FUZZY_ALIASES.find((a) => a.match.test(spoken));
    if (fuzzy) return fuzzy.path;
  }

  // Spoken targets have no real word breaks — join tokens, mapping symbol words
  return spoken
    .split(' ')
    .filter((t) => t && t !== 'the' && t !== 'a')
    .map((t) => SPOKEN_SYMBOLS[t] ?? t)
    .join('');
}

/**
 * Parse voice command text into CLI arguments
 *
 * Supported commands:
 * - "scan [file/url]" → runs scan
 * - "check accessibility of [target]" → runs scan
 * - "show me the fixes" → adds --fix flag
 * - "output as json" → adds --json flag
 * - "enable voice" → adds --voice flag
 * - "scan samples/bad-page.html" → --file samples/bad-page.html
 * - "scan http://example.com" → --url http://example.com
 */
export function parseVoiceCommand(text) {
  const normalizedText = text.toLowerCase().trim();
  // Keep the raw transcript — conversation mode routes on the words themselves,
  // not just the extracted flags.
  const args = { text: normalizedText };

  // Check for flags BEFORE we parse target (so we catch them before removal)
  // Check for fix request
  if (normalizedText.includes('fix') ||
      normalizedText.includes('suggest') ||
      normalizedText.includes('repair')) {
    args.fix = true;
  }

  // Check for JSON output
  if (normalizedText.includes('json') || normalizedText.includes('raw output')) {
    args.json = true;
  }

  // Check for voice output (check for "with voice" or "enable voice")
  if (normalizedText.includes('voice') ||
      normalizedText.includes('speak') ||
      normalizedText.includes('read aloud')) {
    args.voice = true;
  }

  // Extract target (file or URL)
  // Pattern: "scan <target>" or "check accessibility of <target>"
  const scanMatch = normalizedText.match(/(?:scan|check|test|analyze)\s+(?:accessibility\s+of\s+)?(.+)/);

  if (scanMatch) {
    let target = scanMatch[1].trim();

    // Remove trailing command phrases (now that we've extracted flags above)
    // Pattern: remove everything after common command separators
    target = target.replace(/\s+(and|with|then|enable)\s+(show|get|generate|suggest|repair|enable|output|voice|speak).*$/i, '');
    target = target.replace(/\s+(output|as|in)\s+(as\s+)?json.*$/i, '');
    target = normalizeSpokenTarget(target);

    // Determine if target is URL or file
    if (target.startsWith('http://') || target.startsWith('https://')) {
      args.url = target;
    } else if (target.startsWith('file://')) {
      args.file = target.replace('file://', '');
    } else if (looksLikeDomain(target)) {
      // Spoken domains arrive bare ("redhat.com") — they are URLs, not files
      args.url = `https://${target}`;
    } else {
      args.file = target;
    }
  } else {
    // Vosk regularly swallows the leading verb — "scan the web page" comes back
    // as just "the web page", which used to dead-end as "I did not catch a scan
    // target". Accept a bare utterance, but only when it names a known demo
    // page, so ordinary speech is never mistaken for a target.
    const bare = TARGET_ALIASES[normalizedText]
      ?? FUZZY_ALIASES.find((a) => a.match.test(normalizedText))?.path;
    if (bare) args.file = bare;
  }

  return args;
}

/**
 * Check if Vosk is available and models are installed
 */
export async function checkVoskAvailability() {
  try {
    // Check if vosk package is available
    const { default: vosk } = await import('vosk').catch(() => ({ default: null }));
    if (!vosk) {
      return {
        available: false,
        error: 'Vosk package not installed. Run: npm install vosk'
      };
    }

    // Check if model directory exists.
    // Resolve bundled models against the package root, not cwd, so --listen
    // works when invoked from another directory.
    const fs = await import('fs/promises');
    const { fileURLToPath } = await import('url');
    const { dirname, join } = await import('path');
    const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

    const modelPaths = [
      process.env.VOSK_MODEL_PATH,
      '/usr/share/vosk/model',
      join(pkgRoot, 'models/vosk-model-small-en-us-0.15'),
      join(pkgRoot, 'models/vosk-model-en-us-0.22'),
    ].filter(Boolean);

    for (const path of modelPaths) {
      try {
        await fs.access(path);
        return { available: true, modelPath: path };
      } catch {
        continue;
      }
    }

    return {
      available: false,
      error: 'Vosk model not found. Download from: https://alphacephei.com/vosk/models'
    };
  } catch (err) {
    return {
      available: false,
      error: `Vosk check failed: ${err.message}`
    };
  }
}

/**
 * Listen for a single voice command.
 *
 * Terminals emit key-down events only — there is no key-release event — so this
 * is a toggle rather than true push-to-talk: SPACE starts recording, and
 * recording ends on a pause in speech, another SPACE, or the safety timeout.
 *
 * Returns parsed command arguments (including the raw transcript as `text`).
 */
export async function listenForCommand(modelPath, options = {}) {
  const { timeout = 15000, sampleRate = 16000, announce = true, voice = {} } = options;

  console.log(chalk.blue('\n  VOICE COMMAND MODE'));
  console.log(chalk.dim('  Press SPACE to start speaking — stops on a pause, or press SPACE again'));
  console.log(chalk.dim('  Press CTRL+C to exit\n'));

  if (announce) {
    await speak('Voice command mode ready. Press space to speak.', voice);
  }

  const vosk = (await import('vosk')).default;
  const mic = (await import('mic')).default;
  const { default: readline } = await import('readline');

  vosk.setLogLevel(-1); // Suppress Kaldi's verbose stderr output

  const model = new vosk.Model(modelPath);
  const recognizer = new vosk.Recognizer({ model, sampleRate });

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();

  return new Promise((resolve, reject) => {
    let isRecording = false;
    let micInstance = null;
    let timeoutId = null;
    let settled = false;
    let transcript = '';
    let detachStream = null;
    let cleanedUp = false;
    // Vosk is native code behind FFI. Once free() runs, any further call into
    // the recognizer dereferences freed memory and takes the whole process down
    // with a SIGSEGV inside Kaldi — no catchable JS error. This flag is the
    // guard for every recognizer call below.
    let recognizerAlive = true;

    /**
     * Stop feeding the recognizer.
     *
     * Killing arecord does NOT stop the Node stream: bytes already buffered
     * keep emitting 'data' on later ticks. Detaching the listeners is what
     * actually ends the flow, and it must happen before free().
     */
    const stopFeeding = () => {
      if (detachStream) {
        detachStream();
        detachStream = null;
      }
      if (micInstance) {
        micInstance.stop();
        micInstance = null;
      }
    };

    const cleanup = () => {
      if (cleanedUp) return; // Ctrl-C calls this outside the `settled` guard
      cleanedUp = true;

      if (timeoutId) clearTimeout(timeoutId);
      stopFeeding();

      // Remove only our handler so repeated calls don't stack listeners
      process.stdin.removeListener('keypress', onKeypress);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();

      recognizerAlive = false;
      recognizer.free();
      model.free();
    };

    const finish = (parsedArgs) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(parsedArgs);
    };

    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const startRecording = () => {
      if (isRecording || settled || !recognizerAlive) return;

      // A retry reuses the recognizer, so make sure the previous attempt's
      // stream is fully detached before a new one starts feeding it.
      stopFeeding();

      isRecording = true;
      transcript = '';
      recognizer.reset();
      console.log(chalk.green('  Listening...'));
      playBeep(1000, 150); // High beep for start

      micInstance = mic({
        rate: String(sampleRate),
        channels: '1',
        debug: false,
        exitOnSilence: 6,
        // The mic module defaults to the raw ALSA device 'plughw:1,0', which
        // grabs the sound card exclusively. Anything already holding it — OBS,
        // a browser tab, Zoom — makes arecord fail with "Device or resource
        // busy". Going through PipeWire/PulseAudio's 'default' instead lets us
        // share the mic, so you can record the demo while the agent listens.
        device: MIC_DEVICE,
      });

      const micInputStream = micInstance.getAudioStream();

      // mic pipes arecord's stderr nowhere and never emits 'error' when the
      // recorder dies, so a busy device would otherwise look like plain silence
      // until the timeout. Track whether any audio actually arrived.
      let gotAudio = false;

      const onProcessExit = () => {
        if (!isRecording || gotAudio) return;
        console.log(chalk.red(`\n  Microphone unavailable — arecord could not open "${MIC_DEVICE}".`));
        console.log(chalk.yellow('  Another app (OBS, Zoom, a browser tab) may be holding it exclusively.'));
        console.log(chalk.dim(`  Check with: arecord -D ${MIC_DEVICE} -d 2 /tmp/mic-check.wav`));
        console.log(chalk.dim('  Override the device with A11Y_MIC_DEVICE=plughw:1,0\n'));
        stopRecording();
      };

      const onData = (data) => {
        // Buffered chunks can arrive after stop; feeding a freed recognizer
        // segfaults the process, so bail unless this is still the live capture.
        if (!recognizerAlive || !isRecording) return;
        gotAudio = true;
        // acceptWaveform() returns true once an utterance is complete;
        // result() and finalResult() already return parsed objects.
        if (recognizer.acceptWaveform(data)) {
          const { text } = recognizer.result();
          if (text) transcript = `${transcript} ${text}`.trim();
        }
      };

      // mic emits 'silence' after exitOnSilence frames of quiet — this is what
      // ends the utterance in normal use.
      const onSilence = () => stopRecording();

      const onError = (err) => {
        console.error(chalk.red(`  Microphone error: ${err.message}`));
        fail(err);
      };

      // Retrying after "no speech" builds a fresh stream. Without this, the old
      // stream's handlers stay attached and race the new one into the same
      // recognizer, which trips a Kaldi assertion and aborts.
      detachStream = () => {
        micInputStream.removeListener('audioProcessExitComplete', onProcessExit);
        micInputStream.removeListener('data', onData);
        micInputStream.removeListener('silence', onSilence);
        micInputStream.removeListener('error', onError);
        // Dropping the last 'data' listener returns the stream to paused mode,
        // which is what actually halts delivery of the buffered chunks.
        micInputStream.pause();
      };

      micInputStream.on('audioProcessExitComplete', onProcessExit);
      micInputStream.on('data', onData);
      micInputStream.on('silence', onSilence);
      micInputStream.on('error', onError);

      micInstance.start();

      timeoutId = setTimeout(() => {
        console.log(chalk.yellow('  Timeout - stopping recording'));
        stopRecording();
      }, timeout);
    };

    const stopRecording = () => {
      if (!isRecording || settled) return;

      isRecording = false;
      clearTimeout(timeoutId);
      timeoutId = null;

      // Detach before draining the recognizer, so no late chunk lands mid-call
      stopFeeding();

      if (recognizerAlive) {
        const { text } = recognizer.finalResult();
        if (text) transcript = `${transcript} ${text}`.trim();
      }

      playBeep(800, 100); // Lower beep for stop
      console.log(chalk.dim('  Recording stopped\n'));

      if (transcript) {
        console.log(chalk.dim(`  [heard: "${transcript}"]`));
        finish(parseVoiceCommand(transcript));
      } else {
        // Stay in the loop so the user can retry without restarting the process
        console.log(chalk.yellow('  No speech detected, press SPACE to try again'));
      }
    };

    function onKeypress(str, key) {
      if (!key) return;

      if (key.ctrl && key.name === 'c') {
        cleanup();
        process.exit(0);
      }

      if (key.name === 'space') {
        if (isRecording) {
          stopRecording();
        } else {
          startRecording();
        }
      }
    }

    process.stdin.on('keypress', onKeypress);
  });
}

/**
 * Simplified fallback: record audio and use whisper.cpp for processing
 * More accurate but higher latency
 */
export async function listenWithWhisper(options = {}) {
  const { timeout = 5000 } = options;

  console.log(chalk.blue('\n  VOICE COMMAND MODE (Whisper)'));
  console.log(chalk.dim('  Press SPACE to start recording...'));

  await speak('Press space to record your command.');

  const { default: readline } = await import('readline');

  return new Promise((resolve, reject) => {
    readline.emitKeypressEvents(process.stdin);

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    process.stdin.on('keypress', async (str, key) => {
      if (key.ctrl && key.name === 'c') {
        process.exit(0);
      }

      if (key.name === 'space') {
        console.log(chalk.green('  Recording... (speak now)'));
        playBeep(1000, 150);

        const audioFile = '/tmp/a11y-voice-command.wav';

        // Record audio using arecord (ALSA)
        const recordProcess = exec(`arecord -d ${timeout / 1000} -f S16_LE -r 16000 ${audioFile}`, async (error) => {
          if (error) {
            reject(new Error(`Recording failed: ${error.message}`));
            return;
          }

          playBeep(800, 100);
          console.log(chalk.dim('  Processing...'));

          try {
            // Process with whisper.cpp
            const { stdout } = await execAsync(`whisper-cpp -m models/ggml-base.en.bin -f ${audioFile} --no-timestamps`);
            const text = stdout.trim();

            if (text) {
              const parsedArgs = parseVoiceCommand(text);
              resolve(parsedArgs);
            } else {
              console.log(chalk.yellow('  No speech detected'));
              resolve({});
            }
          } catch (err) {
            reject(new Error(`Whisper processing failed: ${err.message}`));
          }
        });
      }
    });
  });
}
