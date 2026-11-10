"""Verify the actual compiled Vite bundle with FastAPI static and WebSocket routes."""
from __future__ import annotations
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
dist = ROOT / "frontend" / "dist"
if not (dist / "index.html").is_file():
    sys.exit("FAIL: run npm run build first (frontend/dist/index.html missing).")

from fastapi.testclient import TestClient
from backend.nabhniti.api import app

with TestClient(app) as client:
    home = client.get("/")
    assert home.status_code == 200, f"Dashboard: {home.status_code}"
    assert "NABH" in home.text.upper(), "Unexpected index.html"
    paths = set(re.findall(r"[\"'](/assets/[^\"']+)[\"']", home.text))
    assert paths, "No JS/CSS assets referenced by compiled index.html"
    for path in sorted(paths):
        response = client.get(path)
        assert response.status_code == 200 and response.content, f"Missing compiled asset {path}"
    for path in ("/models/medical.glb", "/models/cargo.glb", "/textures/facade_glass_blue.jpg"):
        response = client.get(path)
        assert response.status_code == 200 and response.content, f"Missing visual asset {path}"
    health = client.get("/health")
    assert health.status_code == 200 and health.json().get("ok") is True
    assert client.get("/docs").status_code == 200
    with client.websocket_connect("/ws") as ws:
        state = ws.receive_json()
        assert state["metrics"]["active"] > 0
print(f"PASS: built dashboard + {len(paths)} compiled JS/CSS assets + GLBs + textures + health + WebSocket")
print("NOTE: This does not prove visual WebGL rendering or 500-UAV FPS; check in browser.")
