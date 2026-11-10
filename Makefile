.PHONY: test quick smoke full models backend frontend
backend:
	cd backend && python -m uvicorn nabhniti.api:app --reload --port 8000
frontend:
	cd frontend && npm run dev
test:
	cd backend && python -m pytest -q
quick:
	cd backend && python -m nabhniti.experiments --preset quick --out ../results/quick.csv
smoke:
	cd backend && python -m nabhniti.experiments --preset smoke --out ../results/smoke.csv
full:
	cd backend && python -m nabhniti.experiments --preset full --steps 28 --out ../results/full_1080_trials.csv
models:
	python tools/create_models.py
