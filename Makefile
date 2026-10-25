.PHONY: install lint typecheck test check format

install:
	pip install -e ".[dev]"

lint:
	ruff check . && ruff format --check .

typecheck:
	mypy src

test:
	pytest --cov=compose_doctor --cov-branch --cov-report=term-missing --cov-fail-under=90

check: lint typecheck test

format:
	ruff format . && ruff check --fix .
