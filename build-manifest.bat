@echo off
REM Double-click this on Windows to rebuild images/challenges/manifest.json
REM from the contents of the challenges folder.

cd /d "%~dp0"
python build_manifest.py
echo.
pause
