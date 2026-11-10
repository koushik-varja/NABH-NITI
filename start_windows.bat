@echo off
setlocal
cd /d "%~dp0"
if not exist "backend\.venv\Scripts\python.exe" (
    py -3 -m venv backend\.venv
)
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
start "NABH-NITI Engine" cmd /k "cd /d %~dp0backend && .venv\Scripts\python.exe -m uvicorn nabhniti.api:app --host 127.0.0.1 --port 8000"
cd frontend
if not exist node_modules call npm install
npm run dev
