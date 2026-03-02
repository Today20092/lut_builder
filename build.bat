@echo off
echo =======================================================
echo LUT Builder - Windows Build Script
echo =======================================================
echo.

:: Check if uv is installed
where uv >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] 'uv' is not installed or not in your PATH.
    echo Please install uv by running the following command in PowerShell:
    echo powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
    echo Or visit https://docs.astral.sh/uv/getting-started/installation/ for more instructions.
    echo.
    pause
    exit /b 1
)

echo [INFO] Syncing dependencies...
call uv sync
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to sync dependencies.
    echo.
    pause
    exit /b 1
)

echo.
echo [INFO] Running lut-builder build...
call uv run lut-builder build
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Build failed.
    echo.
    pause
    exit /b 1
)

echo.
echo [SUCCESS] Build completed successfully.
echo.
pause
