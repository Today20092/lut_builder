@echo off
cd /d "%~dp0"
title LUT Builder

where uv >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] uv is required. Install it from https://docs.astral.sh/uv/
    pause
    exit /b 1
)

uv run lut-builder workspace
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] LUT Builder stopped unexpectedly.
    pause
    exit /b 1
)
