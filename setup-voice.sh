#!/bin/bash

# Setup script for voice commands in a11y-agent
# Downloads Vosk model and installs dependencies

set -e

echo ""
echo "  a11y-agent Voice Commands Setup"
echo "  ================================"
echo ""

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo "  Error: npm not found. Install Node.js first."
    exit 1
fi

# Install Node.js dependencies
echo "  [1/4] Installing Node.js packages..."
npm install vosk mic

# Check for ALSA
if ! command -v arecord &> /dev/null; then
    echo "  Warning: arecord not found. Install alsa-utils:"
    echo "    Fedora: sudo dnf install alsa-utils"
    echo "    Ubuntu: sudo apt-get install alsa-utils"
fi

# Create models directory
echo "  [2/4] Creating models directory..."
mkdir -p models

# Download model
MODEL_NAME="vosk-model-small-en-us-0.15"
MODEL_URL="https://alphacephei.com/vosk/models/${MODEL_NAME}.zip"
MODEL_PATH="models/${MODEL_NAME}"

if [ -d "$MODEL_PATH" ]; then
    echo "  Model already exists: $MODEL_PATH"
    read -p "  Re-download? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "  Skipping download."
    else
        rm -rf "$MODEL_PATH"
    fi
fi

if [ ! -d "$MODEL_PATH" ]; then
    echo "  [3/4] Downloading Vosk model (40MB)..."
    echo "  From: $MODEL_URL"

    if command -v wget &> /dev/null; then
        wget -q --show-progress "$MODEL_URL" -O "models/${MODEL_NAME}.zip"
    elif command -v curl &> /dev/null; then
        curl -L --progress-bar "$MODEL_URL" -o "models/${MODEL_NAME}.zip"
    else
        echo "  Error: wget or curl required for download"
        echo "  Manual download: $MODEL_URL"
        exit 1
    fi

    echo "  [4/4] Extracting model..."
    unzip -q "models/${MODEL_NAME}.zip" -d models/
    rm "models/${MODEL_NAME}.zip"
fi

echo ""
echo "  Setup complete!"
echo ""
echo "  Usage:"
echo "    node src/scan.js --listen"
echo ""
echo "  Test microphone:"
echo "    arecord -d 3 -f S16_LE -r 16000 test.wav && aplay test.wav"
echo ""
echo "  For larger model (1.8GB, better accuracy):"
echo "    wget https://alphacephei.com/vosk/models/vosk-model-en-us-0.22.zip"
echo "    unzip vosk-model-en-us-0.22.zip -d models/"
echo ""
