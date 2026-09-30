@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Taqreerak Bot

if not exist settings.env (
  copy settings.example.env settings.env >nul
  echo.
  echo  [!] Fill in settings.env first, then run this file again.
  notepad settings.env
  exit /b
)

if not exist .venv (
  echo  Setting up for the first time, please wait...
  py -3 -m venv .venv || python -m venv .venv
)
call .venv\Scripts\activate.bat
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -r requirements.txt

echo.
echo  Bot is running. Keep this window open. Close it to stop the bot.
echo.
python bot.py
pause
