@echo off
REM Double-click on Windows to propagate partials/head-common.html
REM into every *.html page that has the :head-common-start/end markers.
cd /d "%~dp0"
python update_head.py
echo.
pause
