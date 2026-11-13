@echo off
title Bangla Voice Recognition System
cd /d "%~dp0"

where python >nul 2>&1
if %errorlevel%==0 (
    python server.py %*
    goto :end
)

where py >nul 2>&1
if %errorlevel%==0 (
    py server.py %*
    goto :end
)

echo.
echo   Python was not found.
echo   Install it from https://www.python.org/downloads/
echo   (or open index.html directly in Google Chrome).
echo.

:end
pause
