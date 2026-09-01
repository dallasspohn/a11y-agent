# Voice Upgrade Guide

**Current:** espeak-ng (robotic, fast, offline)  
**Goal:** Better sounding voice for James persona

---

## Option 1: edge-tts (RECOMMENDED)

**Pros:**
- ✅ FREE (Microsoft Edge TTS)
- ✅ Very natural sounding
- ✅ Easy to install
- ✅ Multiple voices (male/female, accents)
- ✅ Fast

**Cons:**
- ⚠️ Requires internet connection
- ⚠️ Slightly slower than espeak-ng

### Installation

```bash
# Install edge-tts
npm install edge-tts-js

# Or use Python version (recommended)
pip install edge-tts

# Test it
edge-tts --text "Testing accessibility scan results" --write-media test.mp3
mpv test.mp3  # or: ffplay test.mp3
```

### Available Voices

```bash
# List all voices
edge-tts --list-voices | grep -i "en-US"

# Popular options:
# en-US-GuyNeural (male, friendly)
# en-US-JennyNeural (female, professional)
# en-US-AriaNeural (female, expressive)
```

### Code Changes

Replace the `speakText` function in `src/scan.js`:

```javascript
import { exec } from 'child_process';
import { writeFile, unlink } from 'fs/promises';

/**
 * Speak text using Microsoft Edge TTS (if --voice enabled)
 */
async function speakText(text) {
  if (!opts.voice) return;

  const cleanText = stripAnsi(text);
  const escapedText = cleanText.replace(/"/g, '\\"').replace(/'/g, "\\'");
  const tmpFile = `/tmp/a11y-speech-${Date.now()}.mp3`;

  return new Promise((resolve) => {
    // Generate speech file
    exec(`edge-tts --text "${escapedText}" --voice en-US-GuyNeural --write-media "${tmpFile}"`, (error) => {
      if (error) {
        console.error(chalk.dim(`[TTS Error: ${error.message}]`));
        resolve();
        return;
      }

      // Play the file
      exec(`mpv --really-quiet "${tmpFile}"`, async (playError) => {
        if (playError && !playError.message.includes('No such file')) {
          console.error(chalk.dim(`[Playback Error: ${playError.message}]`));
        }
        
        // Clean up
        try {
          await unlink(tmpFile);
        } catch {}
        
        resolve();
      });
    });
  });
}
```

**Add to package.json:**
```json
"edge-tts-js": "^1.0.0"  // Optional: if using Node version
```

---

## Option 2: Piper TTS (Offline Neural)

**Pros:**
- ✅ FREE
- ✅ Neural TTS (sounds natural)
- ✅ Offline (no internet needed)
- ✅ Fast
- ✅ Multiple voices

**Cons:**
- ⚠️ ~50MB model download
- ⚠️ Requires separate binary install

### Installation

```bash
# Install piper
wget https://github.com/rhasspy/piper/releases/latest/download/piper_amd64.tar.gz
tar -xf piper_amd64.tar.gz
sudo mv piper /usr/local/bin/

# Download a voice model
mkdir -p models/piper
cd models/piper
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json
cd ../..
```

### Code Changes

```javascript
async function speakText(text) {
  if (!opts.voice) return;

  const cleanText = stripAnsi(text);
  const tmpFile = `/tmp/a11y-speech-${Date.now()}.wav`;

  return new Promise((resolve) => {
    const piperCmd = `echo "${cleanText}" | piper --model models/piper/en_US-lessac-medium.onnx --output_file "${tmpFile}"`;
    
    exec(piperCmd, (error) => {
      if (error) {
        console.error(chalk.dim(`[TTS Error: ${error.message}]`));
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
```

---

## Option 3: Coqui TTS (High Quality)

**Pros:**
- ✅ FREE
- ✅ Very high quality
- ✅ Voice cloning possible
- ✅ Offline

**Cons:**
- ⚠️ Slower (2-5 seconds per sentence)
- ⚠️ Requires Python + GPU for best performance
- ⚠️ Large models (~1GB)

### Installation

```bash
pip install TTS

# Test
tts --text "Testing accessibility results" --out_path test.wav
aplay test.wav
```

### Code Changes

```javascript
async function speakText(text) {
  if (!opts.voice) return;

  const cleanText = stripAnsi(text);
  const tmpFile = `/tmp/a11y-speech-${Date.now()}.wav`;

  return new Promise((resolve) => {
    const ttsCmd = `tts --text "${cleanText}" --model_name tts_models/en/ljspeech/tacotron2-DDC --out_path "${tmpFile}"`;
    
    exec(ttsCmd, (error) => {
      if (error) {
        console.error(chalk.dim(`[TTS Error: ${error.message}]`));
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
```

---

## Option 4: ElevenLabs (Best Quality, Paid)

**Pros:**
- ✅ Best quality available
- ✅ Very natural
- ✅ Voice cloning
- ✅ Easy API

**Cons:**
- ❌ Paid ($5-$22/month)
- ⚠️ Requires API key
- ⚠️ Internet required

### Installation

```bash
npm install elevenlabs-node
```

### Code Changes

```javascript
import { ElevenLabsClient } from 'elevenlabs-node';

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY
});

async function speakText(text) {
  if (!opts.voice) return;

  const cleanText = stripAnsi(text);
  const tmpFile = `/tmp/a11y-speech-${Date.now()}.mp3`;

  try {
    const audio = await elevenlabs.generate({
      voice: "Adam",  // or "Bella", "Antoni", etc.
      text: cleanText,
    });

    await writeFile(tmpFile, audio);

    return new Promise((resolve) => {
      exec(`mpv --really-quiet "${tmpFile}"`, async (error) => {
        try {
          await unlink(tmpFile);
        } catch {}
        resolve();
      });
    });
  } catch (error) {
    console.error(chalk.dim(`[TTS Error: ${error.message}]`));
  }
}
```

---

## Recommendation for Innovation Days Demo

**Use edge-tts (Option 1)** because:
1. FREE (important for demo)
2. Sounds professional (much better than espeak-ng)
3. Easy to install
4. Fast enough for demo
5. Works on any system with internet

**For post-demo / production:**
- If offline needed: Use Piper (Option 2)
- If best quality needed: Use ElevenLabs (Option 4)

---

## Quick Setup for edge-tts

```bash
# Install
pip install edge-tts

# Test
edge-tts --text "Found 3 critical accessibility violations" --voice en-US-GuyNeural --write-media test.mp3
mpv test.mp3

# If it sounds good, update src/scan.js with Option 1 code above
```

---

## Voice Selection for James Persona

**Recommended voices for accessibility demo:**

1. **en-US-GuyNeural** — Male, friendly, professional
2. **en-US-DavisNeural** — Male, calm, clear
3. **en-US-JasonNeural** — Male, energetic

**Test them:**
```bash
for voice in GuyNeural DavisNeural JasonNeural; do
  echo "Testing $voice"
  edge-tts --text "Found 3 critical violations. Image missing alt text at line 47." --voice "en-US-$voice" --write-media "${voice}.mp3"
  mpv "${voice}.mp3"
  sleep 1
done
```

Pick whichever sounds best for the demo!

---

## Integration with --voice Flag

After choosing a voice, you can add a `--voice-engine` flag:

```javascript
program
  .option('--voice', 'Enable text-to-speech output', false)
  .option('--voice-engine <engine>', 'TTS engine: edge|piper|espeak (default: edge)', 'edge')
  .option('--voice-name <name>', 'Voice name (edge-tts only)', 'en-US-GuyNeural')
```

Then in `speakText`:
```javascript
async function speakText(text) {
  if (!opts.voice) return;

  switch (opts.voiceEngine) {
    case 'edge':
      return speakWithEdge(text, opts.voiceName);
    case 'piper':
      return speakWithPiper(text);
    case 'espeak':
      return speakWithEspeak(text);
    default:
      return speakWithEdge(text, opts.voiceName);
  }
}
```

---

## Testing After Upgrade

```bash
# Test basic voice
node src/scan.js --file samples/bad-page.html --voice

# Test with different voice
node src/scan.js --file samples/bad-page.html --voice --voice-name en-US-JennyNeural

# Test listen + voice (full James workflow)
node src/scan.js --listen --voice
```

---

## Demo Impact

**Before (espeak-ng):**
> "Found three critical violations" ← Robotic, hard to understand

**After (edge-tts):**
> "Found three critical violations" ← Natural, professional, clear

**This makes the James persona story much more compelling!**
