"""Run after start_production_windows.bat or start_production.sh.

Confirms the compiled dashboard and API are served from the SAME origin.
This is a connectivity check, not a browser-render/performance test.
"""
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parents[1]
dist = root / "frontend" / "dist"
if not (dist / "index.html").is_file():
    sys.exit("FAIL: frontend/dist/index.html not found. Run the production launcher or npm run build first.")

origin = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000").rstrip("/")
try:
    with urllib.request.urlopen(origin + "/health", timeout=7) as response:
        health = json.load(response)
        assert response.status == 200 and health.get("ok") is True, health
    with urllib.request.urlopen(origin + "/", timeout=7) as response:
        page = response.read().decode("utf-8")
        assert response.status == 200 and "NABH" in page.upper(), "Dashboard HTML missing"
    print("PASS: production server serves the dashboard and API from", origin)
    print("PASS: health metadata", json.dumps(health))
    print("NOTE: Run a real browser smoke test for WebGL, WebSocket, controls, and FPS.")
except (OSError, AssertionError, urllib.error.URLError) as exc:
    sys.exit(f"FAIL: production smoke test at {origin}: {exc}")
