# Working on Compose Doctor

These rules apply to every change, whether made by a person or an AI coding agent.

1. **Real functionality only.** No stubs, `pass` bodies, `TODO` placeholders, or mocked behaviour
   presented as working.
2. **Fix, don't report.** When a check fails, fix the code. Never weaken or skip a test, add
   `# type: ignore` / `# noqa` without a one-line justification comment, or lower the coverage
   threshold.
3. **No invented output.** Every sample output in README.md must come from actually running the CLI.
4. **Never print secret values.** Findings about environment variables name the *key* only. No
   output format, error message or log line may contain an environment value from the input file.
5. **Safe YAML only.** Never call `yaml.load` or construct arbitrary Python objects. Parse with
   `yaml.compose` (node tree) and convert nodes in `loader.py`.
6. **One runtime dependency:** `PyYAML`. Justify any other in SPEC.md; prefer the standard library.
7. **Fixtures are synthetic** and use obviously fake values (see `tests/fixtures/README.md`).
8. **Git:** Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`).
   Run `make check` before every commit; do not commit while it fails.
9. If something is ambiguous or contradictory, take the most conservative interpretation and
   record it in SPEC.md under "Decisions".

## Commands

```
make install    # pip install -e ".[dev]"
make check      # ruff, ruff format --check, mypy --strict, pytest with >=90% branch coverage
make format     # apply ruff formatting and safe fixes
```
