@echo off
setlocal
cd /d "%~dp0"
echo [1/4] Checking Python launcher...
where py >nul 2>nul
if errorlevel 1 (
  echo ERROR: Install Python 3.11 or newer and make sure py is available.
  exit /b 1
)
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo ERROR: Install Node.js 22 or newer and ensure npm is in PATH.
  exit /b 1
)
if not exist "backend\.venv\Scripts\python.exe" py -3 -m venv backend\.venv
if errorlevel 1 exit /b 1
echo [2/4] Installing Python dependencies...
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
if errorlevel 1 exit /b 1
echo [3/4] Installing frontend dependencies and running production checks...
cd frontend
call npm.cmd install --no-audit --no-fund
if errorlevel 1 exit /b 1
call npm.cmd run test:encoding
if errorlevel 1 exit /b 1
call npm.cmd run test:visuals
if errorlevel 1 exit /b 1
call npm.cmd run build
if errorlevel 1 exit /b 1
if not exist dist\index.html (
  echo ERROR: Vite build did not produce frontend\dist\index.html
  exit /b 1
)
cd ..
backend\.venv\Scripts\python.exe tools\check_compiled_app.py
if errorlevel 1 exit /b 1
echo [4/4] Launching production server at http://127.0.0.1:8000
backend\.venv\Scripts\python.exe -m uvicorn nabhniti.api:app --app-dir backend --host 127.0.0.1 --port 8000
