#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v npm >/dev/null 2>&1; then echo 'Node.js/npm is required' >&2; exit 1; fi
if ! command -v python3 >/dev/null 2>&1; then echo 'Python 3.11+ is required' >&2; exit 1; fi
if [[ ! -x backend/.venv/bin/python ]]; then python3 -m venv backend/.venv; fi
backend/.venv/bin/python -m pip install -r backend/requirements.txt
(cd frontend && npm install --no-audit --no-fund && npm run test:encoding && npm run test:visuals && npm run build)
[[ -f frontend/dist/index.html ]] || { echo 'Vite dist/index.html was not generated' >&2; exit 1; }
backend/.venv/bin/python tools/check_compiled_app.py
exec backend/.venv/bin/python -m uvicorn nabhniti.api:app --app-dir backend --host 127.0.0.1 --port 8000
