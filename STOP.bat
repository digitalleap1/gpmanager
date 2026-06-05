@echo off
title GPOMS - Stop
cd /d "%~dp0"
echo Stopping GPOMS containers (your data is kept)...
docker compose down
echo.
echo Stopped. Run START.bat to bring it back up.
pause
