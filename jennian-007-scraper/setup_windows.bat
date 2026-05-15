@echo off
echo Setting up Jennian 007 Scraper...
python -m venv .venv
call .venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium
mkdir logs 2>nul
echo Setup complete. Run: .venv\Scripts\python run_daily.py
pause
