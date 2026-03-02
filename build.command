#!/bin/bash

# Ensure we're running from the directory where the script is located
cd "$(dirname "$0")"

echo "======================================================="
echo "LUT Builder - macOS Build Script"
echo "======================================================="
echo ""

# Check if uv is installed
if ! command -v uv &> /dev/null; then
    echo "[ERROR] 'uv' is not installed or not in your PATH."
    echo "Please install uv by running:"
    echo "curl -LsSf https://astral.sh/uv/install.sh | sh"
    echo "Or visit https://docs.astral.sh/uv/getting-started/installation/ for more instructions."
    echo ""
    echo "Press any key to exit..."
    read -n 1
    exit 1
fi

echo "[INFO] Syncing dependencies..."
uv sync
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to sync dependencies."
    echo ""
    echo "Press any key to exit..."
    read -n 1
    exit 1
fi

echo ""
echo "[INFO] Running lut-builder build..."
uv run lut-builder build
if [ $? -ne 0 ]; then
    echo ""
    echo "[ERROR] Build failed."
    echo ""
    echo "Press any key to exit..."
    read -n 1
    exit 1
fi

echo ""
echo "[SUCCESS] Build completed successfully."
echo ""
echo "Press any key to exit..."
read -n 1
