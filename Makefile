# Digital Leap GPOMS - make shortcuts (for bash / make users; Windows users: use .\dev.ps1)
# Usage: make <target>

BACKEND := backend
FRONTEND := frontend
PY := $(BACKEND)/.venv/bin/python
ALEMBIC := $(BACKEND)/.venv/bin/alembic

.PHONY: help setup db down install migrate seed api test lint web web-install fullstack logs health git-status

help:                ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

setup:               ## Copy .env.example -> .env (where missing)
	@for f in "":"" ".env.example:.env" "$(BACKEND)/.env.example:$(BACKEND)/.env" "$(FRONTEND)/.env.example:$(FRONTEND)/.env"; do \
		s=$${f%%:*}; d=$${f##*:}; [ -z "$$s" ] && continue; \
		if [ -f "$$s" ] && [ ! -f "$$d" ]; then cp "$$s" "$$d"; echo "created $$d"; else echo "exists  $$d"; fi; done

db:                  ## Start Postgres + pgAdmin (docker)
	docker compose up -d db pgadmin

down:                ## Stop all docker services
	docker compose down

install:             ## Create venv + install backend deps
	python -m venv $(BACKEND)/.venv && $(PY) -m pip install --upgrade pip && \
	$(PY) -m pip install -r $(BACKEND)/requirements.txt -r $(BACKEND)/requirements-dev.txt

migrate:             ## Apply DB migrations
	cd $(BACKEND) && .venv/bin/alembic upgrade head

seed:                ## Seed roles + admin
	cd $(BACKEND) && .venv/bin/python -m scripts.seed

api:                 ## Run API dev server
	cd $(BACKEND) && .venv/bin/python -m uvicorn app.main:app --reload

test:                ## Run backend tests
	cd $(BACKEND) && .venv/bin/python -m pytest -q

lint:                ## Lint backend
	cd $(BACKEND) && .venv/bin/python -m ruff check app

web-install:         ## Install frontend deps
	cd $(FRONTEND) && npm install

web:                 ## Run web dev server
	cd $(FRONTEND) && npm run dev

fullstack:           ## Up full stack (docker, build)
	docker compose up --build

logs:                ## Tail docker logs
	docker compose logs -f --tail=120

health:              ## Curl health endpoints
	@curl -s http://localhost:8000/ && echo "" && curl -s http://localhost:8000/api/health && echo ""

git-status:          ## Short git status
	git status --short --branch
