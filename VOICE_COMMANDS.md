# Voice Commands for a11y-agent

Speech-to-text voice control for hands-free accessibility scanning.

## Features

- **Push-to-talk interface**: Press and hold SPACE to speak
- **Natural language commands**: Speak commands like "scan bad-page.html and show me the fixes"
- **Audio feedback**: Beeps indicate recording start/stop
- **Offline processing**: Uses Vosk for local, privacy-first STT
- **Low latency**: ~100-200ms recognition delay

## Installation

### 1. Install Node.js Dependencies

```bash
npm install vosk mic
```

### 2. Install System Dependencies

**Fedora/RHEL:**
```bash
sudo dnf install alsa-utils beep
```

**Ubuntu/Debian:**
```bash
sudo apt-get install alsa-utils beep
```

### 3. Download Vosk Model

Choose one:

**Small model (40MB)** - Fast, good enough for commands:
```bash
cd a11y-agent
mkdir -p models
wget https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip
unzip vosk-model-small-en-us-0.15.zip -d models/
```

**Full model (1.8GB)** - Better accuracy for complex commands:
```bash
wget https://alphacephei.com/vosk/models/vosk-model-en-us-0.22.zip
unzip vosk-model-en-us-0.22.zip -d models/
```

### 4. Configure Microphone

Test your microphone:
```bash
arecord -d 3 -f S16_LE -r 16000 test.wav
aplay test.wav
```

If no sound, check `alsamixer` or PulseAudio settings.

## Usage

### Basic Voice Command Mode

```bash
node src/scan.js --listen
```

Then:
1. Press and hold SPACE
2. Speak your command
3. Release SPACE
4. Command executes automatically

### Supported Commands

| Voice Command | Equivalent CLI |
|--------------|----------------|
| "scan samples/bad-page.html" | `--file samples/bad-page.html` |
| "scan http://example.com" | `--url http://example.com` |
| "check accessibility of bad-page.html" | `--file bad-page.html` |
| "scan bad-page.html and show me the fixes" | `--file bad-page.html --fix` |
| "scan example.com output as json" | `--url http://example.com --json` |
| "scan bad-page.html with voice" | `--file bad-page.html --voice` |

### Advanced Usage

**Specify model path:**
```bash
node src/scan.js --listen --model-path ./models/vosk-model-en-us-0.22
```

**Combine with other flags:**
```bash
# Listen for command, but also force JSON output
node src/scan.js --listen --json
```

## Voice Command Parsing

The parser understands:

- **Targets**: File paths, URLs, or "samples/file.html"
- **Fix flag**: "fix", "suggest", "repair" → `--fix`
- **JSON flag**: "json", "raw output" → `--json`
- **Voice flag**: "enable voice", "speak", "read aloud" → `--voice`

### Examples

```text
Input: "scan samples/bad-page.html and show fixes"
Output: { file: "samples/bad-page.html", fix: true }

Input: "check accessibility of http://example.com with voice"
Output: { url: "http://example.com", voice: true }

Input: "test bad-page.html output as json"
Output: { file: "bad-page.html", json: true }
```

## Troubleshooting

### "Vosk package not installed"
```bash
npm install vosk
```

### "Vosk model not found"
Download and extract model to `./models/` directory (see Installation step 3)

### "Microphone error"
- Check microphone permissions
- Test with `arecord -l` to list devices
- Verify PulseAudio/ALSA configuration

### Low accuracy
- Upgrade to full model (vosk-model-en-us-0.22)
- Speak clearly and avoid background noise
- Add custom vocabulary for technical terms (see Vosk docs)

### No audio feedback (beeps)
- Install `beep` package: `sudo dnf install beep`
- Or use `speaker-test` (usually pre-installed)

## Architecture

### Components

1. **voice-commands.js**: STT engine integration
   - `listenForCommand()`: Main push-to-talk loop
   - `parseVoiceCommand()`: NLP for command extraction
   - `checkVoskAvailability()`: Dependency validation

2. **scan.js**: CLI integration
   - `--listen` flag activates voice mode
   - Merges voice args with CLI args

### Flow

```
User presses SPACE
  → Start recording (beep + "Listening...")
  → Audio stream → Vosk recognizer
User releases SPACE
  → Stop recording (beep)
  → Parse text → extract args
  → Merge with CLI opts
  → Execute scan
```

### Future Enhancements

- [ ] Wake word support ("hey a11y")
- [ ] Multi-turn conversations
- [ ] Custom vocabulary for technical terms
- [ ] Whisper.cpp fallback for higher accuracy
- [ ] Voice confirmation before executing

## Technical Details

- **STT Engine**: Vosk (Apache 2.0 license)
- **Model**: Kaldi-based neural network
- **Sample Rate**: 16kHz mono
- **Latency**: 100-200ms (small model)
- **Accuracy**: ~85-90% for general speech, ~70-80% for technical terms

## Privacy

All speech recognition happens **locally**. No audio is sent to external servers. Vosk runs entirely offline.

## Related

- Text-to-speech output: `--voice` flag (uses espeak-ng)
- API integration: See `VOICE_COMMANDS_API.md` for programmatic usage
