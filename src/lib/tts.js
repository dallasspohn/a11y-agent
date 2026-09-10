/**
 * Text-to-Speech Module
 * Supports multiple TTS engines with edge-tts as default
 */

import { exec, execFile } from 'child_process';
import { unlink } from 'fs/promises';
import { promisify } from 'util';
import chalk from 'chalk';

const execFileAsync = promisify(execFile);

// edge-tts needs the network. When it fails we back off rather than retry on
// every line — eating the connect timeout per sentence turns a live demo into
// dead air — but the backoff expires, so one blip no longer means robotic audio
// for the rest of the session. A11Y_VOICE_ENGINE=espeak skips edge entirely.
let edgeFailures = 0;
let edgeRetryAt = 0;

// How long to wait on edge-tts before giving up and using espeak
const EDGE_TIMEOUT_MS = Number(process.env.A11Y_EDGE_TIMEOUT_MS) || 10000;

// Backoff after a failure, doubling per consecutive failure up to the cap, so a
// genuinely offline session settles down instead of stalling on every line.
const EDGE_RETRY_MS = Number(process.env.A11Y_EDGE_RETRY_MS) || 30000;
const EDGE_RETRY_MAX_MS = 300000;

function edgeBackoffMs() {
  return Math.min(EDGE_RETRY_MS * 2 ** (edgeFailures - 1), EDGE_RETRY_MAX_MS);
}

// Single source of truth for how the tool sounds. Every entry point
// (scan, lint, agent, voice-commands) reads these so the voice never
// changes mid-conversation. Override per-shell with A11Y_VOICE_*.
export const DEFAULT_ENGINE = process.env.A11Y_VOICE_ENGINE || 'edge';
export const DEFAULT_VOICE = process.env.A11Y_VOICE_NAME || 'en-US-GuyNeural';
export const DEFAULT_RATE = process.env.A11Y_VOICE_RATE || '175';

/**
 * Strip ANSI color codes from text
 */
function stripAnsi(text) {
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

/**
 * Speak text using Microsoft Edge TTS (best quality, free)
 */
async function speakWithEdge(text, voice = 'en-US-GuyNeural', rate = '175') {
  const cleanText = stripAnsi(text);

  // Inside the backoff window, go straight to espeak rather than re-timing-out
  if (Date.now() < edgeRetryAt) return speakWithEspeak(text, rate);

  const tmpFile = `/tmp/a11y-speech-${process.pid}-${Date.now()}.mp3`;

  // Convert rate (words per minute) to percentage
  // 175 wpm is normal (0%), slower is negative, faster is positive
  const rateNum = parseInt(rate);
  const ratePercent = Math.round((rateNum - 175) / 1.75);
  const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;

  try {
    // execFile passes argv directly — no shell. The old string-interpolated
    // exec() mangled apostrophes and would break outright on a backtick or $(
    // in a violation message.
    await execFileAsync(
      'edge-tts',
      ['--text', cleanText, '--voice', voice, `--rate=${rateStr}`, '--write-media', tmpFile],
      { timeout: EDGE_TIMEOUT_MS }
    );
  } catch (error) {
    edgeFailures++;
    const backoff = edgeBackoffMs();
    edgeRetryAt = Date.now() + backoff;
    const reason = error.killed
      ? `no response in ${EDGE_TIMEOUT_MS / 1000}s`
      : (error.stderr || error.message || '').trim().split('\n').pop() || 'unknown error';
    console.error(chalk.dim(`[edge-tts unavailable: ${reason}]`));
    console.error(chalk.dim(`[using espeak-ng; retrying edge-tts in ${Math.round(backoff / 1000)}s]`));
    await unlink(tmpFile).catch(() => {});
    return speakWithEspeak(text, rate);
  }

  // Recovered — say so, otherwise the voice changing back looks like a glitch
  if (edgeFailures) {
    console.error(chalk.dim('[edge-tts recovered]'));
    edgeFailures = 0;
    edgeRetryAt = 0;
  }

  try {
    await playAudioFile(tmpFile);
  } catch {
    console.error(chalk.dim('[audio playback failed — falling back to espeak-ng]'));
    await speakWithEspeak(text, rate);
  } finally {
    await unlink(tmpFile).catch(() => {});
  }
}

/**
 * Play an audio file with whichever player is installed.
 *
 * Tried in order; throws only if every one is missing or fails.
 */
async function playAudioFile(file) {
  const players = [
    ['ffplay', ['-nodisp', '-autoexit', '-loglevel', 'quiet', file]],
    ['mpv', ['--really-quiet', file]],
    ['mpg123', ['-q', file]],
  ];

  for (const [bin, args] of players) {
    try {
      await execFileAsync(bin, args);
      return;
    } catch (err) {
      if (err.code === 'ENOENT') continue; // not installed, try the next
      throw err;
    }
  }
  throw new Error('no audio player found (install ffmpeg, mpv, or mpg123)');
}

/**
 * Speak text using Piper TTS (offline neural TTS)
 */
async function speakWithPiper(text, modelPath = 'models/piper/en_US-lessac-medium.onnx') {
  const cleanText = stripAnsi(text);
  const tmpFile = `/tmp/a11y-speech-${process.pid}-${Date.now()}.wav`;

  try {
    // Text goes in over stdin rather than through `echo "..."`, which broke on
    // apostrophes and would execute a backtick in a violation message.
    const piper = execFile('piper', ['--model', modelPath, '--output_file', tmpFile]);
    piper.stdin.end(cleanText);
    await new Promise((resolve, reject) => {
      piper.on('error', reject);
      piper.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exited ${code}`))));
    });
    await execFileAsync('aplay', ['-q', tmpFile]);
  } catch (error) {
    console.error(chalk.dim(`[Piper TTS Error: ${error.message}]`));
    console.error(chalk.yellow('Tip: Install from https://github.com/rhasspy/piper'));
  } finally {
    await unlink(tmpFile).catch(() => {});
  }
}

/**
 * Speak text using espeak-ng (fast, robotic, offline)
 */
async function speakWithEspeak(text, rate = '175') {
  const cleanText = stripAnsi(text);
  if (!cleanText.trim()) return;

  // This is the last line of defence — if it throws, the tool goes silent for a
  // blind user. argv form, and never rethrow.
  try {
    await execFileAsync('espeak-ng', ['-s', String(parseInt(rate) || 175), '--', cleanText]);
  } catch (error) {
    console.error(chalk.dim(`[espeak-ng Error: ${error.message}]`));
  }
}

/**
 * Main TTS function - routes to appropriate engine
 */
export async function speak(text, options = {}) {
  const {
    engine = DEFAULT_ENGINE,
    voice = DEFAULT_VOICE,
    rate = DEFAULT_RATE,
    enabled = true
  } = options;

  if (!enabled) return;

  switch (engine) {
    case 'edge':
      return speakWithEdge(text, voice, rate);
    case 'piper':
      return speakWithPiper(text);
    case 'espeak':
      return speakWithEspeak(text, rate);
    default:
      console.error(chalk.yellow(`Unknown TTS engine: ${engine}, falling back to espeak-ng`));
      return speakWithEspeak(text, rate);
  }
}

/**
 * Check if a TTS engine is available
 */
export async function checkTTSAvailability(engine = 'edge') {
  return new Promise((resolve) => {
    let checkCmd;

    switch (engine) {
      case 'edge':
        checkCmd = 'command -v edge-tts';
        break;
      case 'piper':
        checkCmd = 'command -v piper';
        break;
      case 'espeak':
        checkCmd = 'command -v espeak-ng';
        break;
      default:
        resolve({ available: false, error: `Unknown engine: ${engine}` });
        return;
    }

    exec(checkCmd, (error) => {
      if (error) {
        resolve({
          available: false,
          error: `${engine} not found. Install it first.`,
          engine
        });
      } else {
        resolve({ available: true, engine });
      }
    });
  });
}
