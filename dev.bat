@echo off
cd /d "%~dp0"

where npm >nul 2>nul || (
    echo [ERROR] npm is required.
    pause
    exit /b 1
)

if not exist "frontend\node_modules" call npm --prefix frontend install || exit /b 1

start "LUT Builder Frontend" cmd /k "npm --prefix frontend run build -- --watch"
call workspace.bat
