@echo off
setlocal

py -3.11 -c "import sys" >nul 2>nul
if not errorlevel 1 (
  py -3.11 %*
  exit /b %errorlevel%
)

py -3 -c "import sys" >nul 2>nul
if not errorlevel 1 (
  py -3 %*
  exit /b %errorlevel%
)

python -c "import sys" >nul 2>nul
if not errorlevel 1 (
  python %*
  exit /b %errorlevel%
)

python3 -c "import sys" >nul 2>nul
if not errorlevel 1 (
  python3 %*
  exit /b %errorlevel%
)

echo [ERROR] Python runtime not found. Install Python or expose py/python on PATH.
exit /b 1
