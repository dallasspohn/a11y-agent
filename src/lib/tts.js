/**
 * Text-to-Speech Module
 * Supports multiple TTS engines with edge-tts as default
 */

import { exec } from 'child_process';
import { unlink } from 'fs/promises';
import chalk from 'chalk';

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
  const escapedText = cleanText.replace(/"/g, '\\"').replace(/'/g, "\\'");
  const tmpFile = `/tmp/a11y-speech-${Date.now()}.mp3`;

  // Convert rate (words per minute) to percentage
  // 175 wpm is normal (0%), slower is negative, faster is positive
  const rateNum = parseInt(rate);
  const ratePercent = Math.round((rateNum - 175) / 1.75);
  const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;

  return new Promise((resolve) => {
    // Generate speech file with edge-tts
    const edgeCmd = `edge-tts --text "${escapedText}" --voice "${voice}" --rate="${rateStr}" --write-media "${tmpFile}"`;

    exec(edgeCmd, (error) => {
      if (error) {
        console.error(chalk.dim(`[Edge TTS Error: ${error.message}]`));
        console.error(chalk.yellow('Tip: Install with: pip install edge-tts'));
        resolve();
        return;
      }

      // Play the file (try ffplay first since it's available, fallback to mpv)
      const playCmd = `(command -v ffplay > /dev/null && ffplay -nodisp -autoexit -loglevel quiet "${tmpFile}") || (command -v mpv > /dev/null && mpv --really-quiet "${tmpFile}") || (command -v mpg123 > /dev/null && mpg123 -q "${tmpFile}")`;

      exec(playCmd, async (playError) => {
        if (playError) {
          console.error(chalk.dim(`[Playback Error: ${playError.message}]`));
        }

        // Clean up temp file
        try {
          await unlink(tmpFile);
        } catch (cleanupError) {
          // Ignore cleanup errors
        }

        resolve();
      });
    });
  });
}

/**
 * Speak text using Piper TTS (offline neural TTS)
 */
async function speakWithPiper(text, modelPath = 'models/piper/en_US-lessac-medium.onnx') {
  const cleanText = stripAnsi(text);
  const tmpFile = `/tmp/a11y-speech-${Date.now()}.wav`;

  return new Promise((resolve) => {
    const piperCmd = `echo "${cleanText}" | piper --model "${modelPath}" --output_file "${tmpFile}"`;

    exec(piperCmd, (error) => {
      if (error) {
        console.error(chalk.dim(`[Piper TTS Error: ${error.message}]`));
        console.error(chalk.yellow('Tip: Install from https://github.com/rhasspy/piper'));
        resolve();
        return;
      }

      exec(`aplay "${tmpFile}"`, async (playError) => {
        try {
          await unlink(tmpFile);
        } catch {}
        resolve();
      });
    });
  });
}

/**
 * Speak text using espeak-ng (fast, robotic, offline)
 */
async function speakWithEspeak(text, rate = '175') {
  const cleanText = stripAnsi(text);
  const escapedText = cleanText.replace(/"/g, '\\"').replace(/'/g, "\\'");

  return new Promise((resolve) => {
    exec(`espeak-ng -s ${rate} "${escapedText}"`, (error) => {
      if (error) {
        console.error(chalk.dim(`[espeak-ng Error: ${error.message}]`));
      }
      resolve();
    });
  });
}

/**
 * Main TTS function - routes to appropriate engine
 */
export async function speak(text, options = {}) {
  const {
    engine = 'edge',
    voice = 'en-US-GuyNeural',
    rate = '175',
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
