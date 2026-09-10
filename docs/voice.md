# Voice Setup

Speech in and out, so the tool can be driven without a screen. Both halves are
optional — the scanner works fine without them.

- **Output (TTS)** — `--voice`, and everything `npm run agent` says
- **Input (STT)** — `--listen`, and the agent loop's prompts

Configuration lives in [the README](../README.md#configuration). This file is
setup and troubleshooting only.

---

## Output: text-to-speech

Default is **edge-tts** (`en-US-GuyNeural`), which needs network. It falls back
to **espeak-ng** automatically if edge-tts or the network is missing, so speech
never goes silent.

```bash
pip install edge-tts                   # neural voice (default)
sudo dnf install espeak-ng             # offline fallback
```

Verify:

```bash
edge-tts --text "accessibility agent ready" --write-media /tmp/t.mp3 && ffplay -nodisp -autoexit /tmp/t.mp3
espeak-ng "fallback voice"
```

Other voices: `edge-tts --list-voices`. `en-US-JennyNeural` and
`en-US-AriaNeural` are the usual alternatives. Set with `A11Y_VOICE_NAME`.

Playback uses whichever of `ffplay` / `mpv` / `mpg123` is installed.

---

## Input: speech-to-text

Offline via Vosk. No audio leaves the machine.

```bash
sudo dnf install gcc-c++ make alsa-utils   # native modules need a compiler
npm install vosk mic                       # optional deps, not installed by default
./setup-voice.sh                           # downloads the small model (~40MB)
```

Verify the recognizer without a microphone:

```bash
npm run test:vosk
```

Verify the microphone itself:

```bash
arecord -D default -d 3 -f S16_LE -r 16000 /tmp/mic-check.wav && aplay /tmp/mic-check.wav
```

For better accuracy on technical terms, swap in the full 1.8GB model and point
`VOSK_MODEL_PATH` at it:

```bash
wget https://alphacephei.com/vosk/models/vosk-model-en-us-0.22.zip
unzip vosk-model-en-us-0.22.zip -d models/
export VOSK_MODEL_PATH=./models/vosk-model-en-us-0.22
```

---

## Recording: SPACE is a toggle

Press SPACE to start. Recording stops on a pause in your speech, a second
SPACE, or a 15s safety timeout.

It is **not** push-to-talk, and can't be: terminals emit key-*down* events only,
with no key-release to detect. Holding SPACE would record for ~50ms and stop.
Say this correctly if you are demoing it.

---

## What you can say

`--listen` turns one utterance into CLI flags:

| Say | Runs |
| --- | --- |
| "scan the bad page" | `--file samples/bad-page.html` |
| "scan the web page" | `--file samples/web-page.html` |
| "scan red hat dot com" | `--url https://redhat.com` |
| "scan the bad page and show me the fixes" | `--file … --fix` |
| "scan example dot com output as json" | `--url … --json` |

Spoken punctuation is handled — *"red hat dot com"* becomes `https://redhat.com`.
Fix/JSON/voice intent is picked up from words like "fix", "repair", "json",
"read aloud".

> **The small model will not transcribe file paths.** `samples/bad-page.html`
> comes out as noise. Use the spoken aliases above or a domain name.

For the full triage loop — selecting and applying fixes by voice — see
`npm run agent` in [the README](../README.md#for-james-voice-workflow). Its
selection grammar ("fix issue one and three") is documented there.

---

## Troubleshooting

**`g++: No such file or directory` during `npm install`**
Native modules need a compiler: `sudo dnf install gcc-c++ make`.

**"Vosk model not found"**
Run `./setup-voice.sh`, or set `VOSK_MODEL_PATH` to the model directory.

**"No speech detected" every time, with OBS or a call open**
Another app is holding the sound card exclusively. Capture goes through
PipeWire's `default` device, which mixes inputs, so this should not happen
unless you overrode it:

```bash
unset A11Y_MIC_DEVICE      # raw plughw:N,M devices cannot be shared
arecord -l | grep -A1 '^card'
```

**No beeps**
Tones are synthesized in-process and piped to `aplay`, so ALSA must be present
(`sudo dnf install alsa-utils`). Silence them with `A11Y_NO_BEEP=1`, or change
the length with `A11Y_BEEP_MS=120` (default 70).

**Robotic voice**
That is the espeak fallback — edge-tts or the network is unavailable, and the
reason is printed when it switches. The fallback latches for the session;
restart to retry the neural voice.

**Low STT accuracy**
Use the full model (above), speak clearly, and prefer the short spoken aliases
over long sentences.
