import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';

const execAsync = promisify(exec);

/**
 * Voice command parser for a11y-agent
 * Maps spoken commands to CLI arguments
 */

/**
 * Play audio feedback for listening state changes
 */
async function playBeep(frequency = 800, duration = 100) {
  try {
    // Use beep command if available, fallback to speaker-test
    await execAsync(`beep -f ${frequency} -l ${duration} 2>/dev/null || speaker-test -t sine -f ${frequency} -l 1 >/dev/null 2>&1 &`);
  } catch (err) {
    // Silent fail - audio feedback is nice-to-have
  }
}

/**
 * Speak text using espeak-ng
 */
async function speak(text, rate = 175) {
  const escapedText = text.replace(/"/g, '\\"').replace(/'/g, "\\'");
  return new Promise((resolve) => {
    exec(`espeak-ng -s ${rate} "${escapedText}"`, (error) => {
      if (error) {
        console.error(chalk.dim(`[TTS Error: ${error.message}]`));
      }
      resolve();
    });
  });
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
  const args = {};

  console.log(chalk.dim(`[Voice Input] "${text}"`));

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
    target = target.trim();

    // Determine if target is URL or file
    if (target.startsWith('http://') || target.startsWith('https://')) {
      args.url = target;
    } else if (target.startsWith('file://')) {
      args.file = target.replace('file://', '');
    } else {
      // Assume file path if not URL
      args.file = target;
    }
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

    // Check if model directory exists
    const fs = await import('fs/promises');
    const modelPaths = [
      '/usr/share/vosk/model',
      './models/vosk-model-small-en-us-0.15',
      './models/vosk-model-en-us-0.22',
      process.env.VOSK_MODEL_PATH
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
 * Listen for a single voice command using push-to-talk
 * Returns parsed command arguments
 */
export async function listenForCommand(modelPath, options = {}) {
  const { timeout = 5000, sampleRate = 16000 } = options;

  console.log(chalk.blue('\n  VOICE COMMAND MODE'));
  console.log(chalk.dim('  Press and hold SPACE to speak, release when done'));
  console.log(chalk.dim('  Press CTRL+C to exit\n'));

  await speak('Voice command mode ready. Press and hold space to speak.');

  try {
    const vosk = (await import('vosk')).default;
    const mic = (await import('mic')).default;
    const { default: readline } = await import('readline');

    const model = new vosk.Model(modelPath);
    const recognizer = new vosk.KaldiRecognizer(model, sampleRate);

    // Set up readline for key detection
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    return new Promise((resolve, reject) => {
      let isRecording = false;
      let micInstance = null;
      let timeoutId = null;
      let finalResult = '';

      const startRecording = () => {
        if (isRecording) return;

        isRecording = true;
        console.log(chalk.green('  Listening...'));
        playBeep(1000, 150); // High beep for start

        micInstance = mic({
          rate: sampleRate,
          channels: 1,
          debug: false,
          exitOnSilence: 6
        });

        const micInputStream = micInstance.getAudioStream();

        micInputStream.on('data', (data) => {
          if (recognizer.acceptWaveform(data)) {
            const result = JSON.parse(recognizer.result());
            if (result.text) {
              finalResult = result.text;
            }
          }
        });

        micInputStream.on('error', (err) => {
          console.error(chalk.red(`  Microphone error: ${err.message}`));
          cleanup();
          reject(err);
        });

        micInstance.start();

        // Safety timeout
        timeoutId = setTimeout(() => {
          console.log(chalk.yellow('  Timeout - stopping recording'));
          stopRecording();
        }, timeout);
      };

      const stopRecording = () => {
        if (!isRecording) return;

        isRecording = false;
        clearTimeout(timeoutId);

        if (micInstance) {
          micInstance.stop();
          micInstance = null;
        }

        // Get final result
        const lastResult = JSON.parse(recognizer.finalResult());
        if (lastResult.text) {
          finalResult = lastResult.text;
        }

        playBeep(800, 100); // Lower beep for stop
        console.log(chalk.dim('  Recording stopped\n'));

        if (finalResult) {
          const parsedArgs = parseVoiceCommand(finalResult);
          cleanup();
          resolve(parsedArgs);
        } else {
          console.log(chalk.yellow('  No speech detected, try again'));
          // Don't exit, wait for another command
        }
      };

      const cleanup = () => {
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.stdin.pause();
        recognizer.free();
        model.free();
      };

      // Handle key presses
      process.stdin.on('keypress', (str, key) => {
        if (key.ctrl && key.name === 'c') {
          cleanup();
          process.exit(0);
        }

        if (key.name === 'space') {
          if (!isRecording) {
            startRecording();
          }
        }
      });

      // Handle key releases
      process.stdin.on('keypress', (str, key) => {
        if (key.name === 'space' && isRecording) {
          // Small delay to detect release
          setTimeout(() => {
            if (isRecording) {
              stopRecording();
            }
          }, 50);
        }
      });
    });

  } catch (err) {
    throw new Error(`Voice command failed: ${err.message}`);
  }
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

  return new Promise((resolve, reject) => {
    const { default: readline } = require('readline');
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
