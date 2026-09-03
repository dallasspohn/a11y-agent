#!/bin/bash
# Quick setup script for Microsoft Edge TTS

echo "🎤 A11Y Agent - Edge TTS Setup"
echo "================================"
echo ""

# Check if pip is installed
if ! command -v pip &> /dev/null && ! command -v pip3 &> /dev/null; then
    echo "❌ pip not found. Install Python 3 first:"
    echo "   sudo dnf install python3-pip"
    exit 1
fi

# Install edge-tts
echo "📦 Installing edge-tts..."
pip install edge-tts --user || pip3 install edge-tts --user

# Check if installation succeeded
if ! command -v edge-tts &> /dev/null; then
    echo "⚠️  edge-tts not in PATH. Adding ~/.local/bin to PATH..."
    export PATH="$HOME/.local/bin:$PATH"

    # Add to shell config
    if [ -f "$HOME/.bashrc" ]; then
        echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
        echo "   Added to ~/.bashrc"
    fi
    if [ -f "$HOME/.zshrc" ]; then
        echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
        echo "   Added to ~/.zshrc"
    fi
fi

# Check for audio player
echo ""
echo "🔊 Checking audio players..."
if command -v mpv &> /dev/null; then
    echo "✅ mpv found"
    PLAYER="mpv"
elif command -v ffplay &> /dev/null; then
    echo "✅ ffplay found"
    PLAYER="ffplay"
else
    echo "⚠️  No audio player found. Installing mpv..."
    sudo dnf install mpv -y
    PLAYER="mpv"
fi

# List available voices
echo ""
echo "🎙️  Available voices (showing first 10 English voices):"
edge-tts --list-voices | grep "en-" | head -10

# Test voices
echo ""
echo "🧪 Testing voices..."
echo "   This will play 3 different voices saying a test phrase."
echo "   Press Ctrl+C to skip."
echo ""

TEST_TEXT="Found 3 critical accessibility violations. Image missing alt text at line 47."

for voice in "GuyNeural" "DavisNeural" "JennyNeural"; do
    echo "   Testing en-US-$voice..."
    edge-tts --text "$TEST_TEXT" --voice "en-US-$voice" --write-media "/tmp/test-${voice}.mp3" 2>/dev/null

    if [ "$PLAYER" = "mpv" ]; then
        mpv --really-quiet "/tmp/test-${voice}.mp3" 2>/dev/null
    else
        ffplay -nodisp -autoexit -loglevel quiet "/tmp/test-${voice}.mp3" 2>/dev/null
    fi

    rm -f "/tmp/test-${voice}.mp3"
    sleep 0.5
done

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Pick your favorite voice from above"
echo "   2. Test with: node src/scan.js --file samples/bad-page.html --voice --voice-engine edge"
echo "   3. Change voice: node src/scan.js --file samples/bad-page.html --voice --voice-engine edge --voice-name en-US-JennyNeural"
echo ""
echo "💡 Tip: To see all voices, run: edge-tts --list-voices | grep en-"
