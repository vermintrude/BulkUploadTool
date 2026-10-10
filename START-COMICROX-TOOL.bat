@echo off
cd /d "%~dp0"
title ComicRox PLANNER REPAIR ISOLATED TEST - PORT 18789 - KEEP THIS WINDOW OPEN
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0ComicRox-Server.ps1"
echo.
echo ComicRox server has stopped. If this was unexpected, leave this window open.
pause
