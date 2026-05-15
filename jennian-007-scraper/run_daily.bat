@echo off
REM Jennian 007 — daily scraper + brief generator
REM Run by Windows Task Scheduler at 5:45am

cd /d "%~dp0"
.venv\Scripts\python run_daily.py >> logs\daily.log 2>&1
