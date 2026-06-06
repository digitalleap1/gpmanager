@echo off
title GPOMS - Stop
cd /d "%~dp0"
echo Stopping GPOMS local servers (ports 8010 + 3000)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetTCPConnection -LocalPort 8010,3000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } catch {} }; Write-Host 'Stopped.'"
echo.
echo Your data is safe in the Neon cloud database. Run START.bat to bring it back.
pause
