@echo off
echo === Jennian 007 Scraper Setup ===
echo.

REM Create virtual environment
python -m venv .venv
if errorlevel 1 (
    echo ERROR: Python not found. Install from https://python.org
    pause
    exit /b 1
)

REM Install dependencies
.venv\Scripts\pip install supabase playwright beautifulsoup4 python-dotenv anthropic httpx
if errorlevel 1 goto error

REM Install Playwright browser
.venv\Scripts\playwright install chromium
if errorlevel 1 goto error

echo.
echo === Setup complete! ===
echo.
echo Next: run test_run.bat to verify everything works.
pause
exit /b 0

:error
echo.
echo ERROR during setup. Check output above.
pause
exit /b 1
