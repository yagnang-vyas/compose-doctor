# Compose Doctor — Specification

Version 0.1.0

## 1. Problem

Docker Compose files are often copied from tutorials and reach production with `latest` image tags,
databases published on every network interface, the Docker socket mounted into containers,
plain-text passwords in `environment:`, no healthchecks and no restart policy. Nothing flags these
until something breaks or leaks.

## 2. Users

Developers and small teams who self-host with Docker Compose, often on a single VPS behind a
reverse proxy, and who want a fast check in their editor loop and in CI.

## 3. Scope

Compose Doctor reads one or more Compose files, runs a set of documented rules, and reports findings
with a rule ID, severity, file, line and a concrete fix. It produces Text, JSON and SARIF 2.1.0
output, and its exit codes make it usable as a CI gate.

### Non-goals for v0.1.0

- Merging multiple files or override files the way `docker compose -f a -f b` does. Each file is
  linted on its own.
- Resolving `${VAR}` interpolation from the environment or `.env` files. Interpolated values are
  treated as unknown.
- Auto-fixing files.
- Linting Dockerfiles or Kubernetes manifests.
- Publishing to PyPI or the GitHub Marketplace.

## 4. Interface

```
compose-doctor [-h] [--version] [--format {text,json,sarif}] [--fail-on {error,warning,note,never}]
               [--config PATH] [--ignore IDS] [--show-suppressed] [--list-rules]
               [FILE ...]
```

- `FILE ...`: files to lint; `-` reads standard input (reported as `<stdin>`).
- With no files, the first existing of `compose.yaml`, `compose.yml`, `docker-compose.yaml`,
  `docker-compose.yml` in the current directory is used (the Compose specification's lookup order).
- `--fail-on` (default `error`): exit 1 if any unsuppressed finding has that severity or worse.
- `--ignore CD010,CD015`: add rule IDs to the ignore list from the config file.
- `--list-rules`: print every rule's ID, severity, title and rationale, then exit 0.
- Configuration: `.compose-doctor.yml` in the current directory, or `--config PATH`. CLI flags
  override the config file.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | No unsuppressed finding at or above `--fail-on` |
| 1 | At least one such finding |
| 2 | Usage or input error, reported on stderr as `compose-doctor: error: <file>:<line>: <message>` |
| 130 | Interrupted |
| 141 | Output pipe closed early |

## 5. Design

### 5.1 Modules

| Module | Responsibility |
|---|---|
| `loader.py` | Parse YAML into a node tree with `yaml.compose`, convert it to located values, build the `ComposeFile` model |
| `model.py` | `Located[T]`, `Service`, `ComposeFile`, `Finding`, `Severity` |
| `interpolation.py` | Detect `${VAR}` / `$VAR` (detection only) |
| `rules/` | Rule registry and the rule implementations |
| `suppress.py` | Inline `# compose-doctor: ignore ...` comments |
| `config.py` | `.compose-doctor.yml` |
| `report/` | Text, JSON and SARIF renderers |
| `cli.py` | Argument parsing, file discovery, exit codes |

### 5.2 The loader

PyYAML's `yaml.load` family discards source positions and, with unsafe loaders, can construct
arbitrary Python objects. Compose Doctor instead calls `yaml.compose(text, Loader=yaml.SafeLoader)`,
which returns a node tree where every node carries a start mark, and converts the tree itself:

- **Located values.** Every converted value is a `Located` holding the Python value and the
  1-based line of the node (`start_mark.line + 1`). Mappings are `dict[str, Located]` plus the
  line of each key, so rules can point at the offending key; sequences are `list[Located]`, so
  rules can point at the offending list item.
- **Scalars.** The node tag set by PyYAML's YAML 1.1 resolver decides the type: `bool`, `int`,
  `float`, `null` or `str`. The raw source text is kept as well. Constructing the typed value uses
  `SafeConstructor`'s scalar constructors only, so no arbitrary objects can be built.
- **Aliases.** `yaml.compose` already resolves `*name` to the same node object as its anchor, so
  an alias converts to a value located at the anchor's definition.
- **Merge keys.** `<<: *defaults` and `<<: [*a, *b]` are applied during conversion with YAML 1.1
  semantics: keys written explicitly in the mapping win over merged keys, and earlier entries in a
  merge list win over later ones. A merged value keeps the line of its definition.
- **Alias-bomb protection.** Conversion counts every node it produces. Above 100,000 it raises
  `InputError("document expands to too many nodes")`. Because aliases share nodes, a "billion
  laughs" document is small to compose but enormous to convert; the counter stops it early.
- **Errors.** YAML syntax errors (using the problem mark), an empty document, a top-level value
  that is not a mapping, a missing or non-mapping `services:` key, a service that is not a mapping,
  and multiple documents in one file all raise `InputError` with the file and line.
- **Extension fields.** Keys starting with `x-` are never linted, but can be merge sources.

### 5.3 Rules

Each rule has an ID, title, default severity, a rationale paragraph, a fix message, and a pure
`check(service, file) -> list[Finding]` function. Rules read the parts of a service they need
through small typed helpers; the model does not attempt to cover the whole Compose specification.

### 5.4 Privacy

Findings about environment variables name the key only. No output format, error message or log
line contains an environment value from the input file. Loader error messages never quote scalar
values from the document.

## 6. Acceptance criteria

- [x] `pip install .` into a fresh virtual environment works, and `compose-doctor --version`
      prints `compose-doctor 0.1.0`.
- [x] `python -m compose_doctor` behaves the same as `compose-doctor`.
- [x] The loader reports correct 1-based lines for keys and list items, including values reached
      through aliases and merge keys.
- [x] Merge keys follow YAML 1.1 precedence (explicit keys win; earlier merge-list entries win).
- [x] An alias bomb is rejected with an `InputError` instead of exhausting memory.
- [x] Every loader error case reports the file and the correct line.
- [x] Interpolation detection covers every form in the brief and ignores `$$`.
- [x] Each of rules CD001–CD015 has passing good and bad fixture tests, including every
      "must not trigger" case.
- [x] An unparseable port entry produces a `CD000` finding instead of a crash.
- [x] Inline suppressions (same line and line above), `ignore-file`, config ignores, per-service
      ignores and severity overrides work; unknown rule IDs are rejected.
- [x] Suppressed findings are counted in every output format and listed with `--show-suppressed`.
- [x] Text, JSON and SARIF output match the documented shapes; SARIF results reference valid rules.
- [x] Every documented exit code (0, 1, 2, 130, 141) is tested.
- [x] No environment value from the input appears in any output format or error message.
- [x] `examples/hardened/compose.yaml` produces zero findings; `examples/insecure/compose.yaml`
      triggers at least 12 rules.
- [x] README sample output is real and the rule table matches `--list-rules`.
- [x] `make check` passes: ruff, ruff format, mypy strict, pytest with ≥90% branch coverage.

## 7. Test plan

- **Unit:** loader (lines, aliases, merge keys, alias bomb, every error), interpolation, port and
  image parsers, every rule's good and bad fixtures, suppressions and config.
- **Integration:** the real CLI through `subprocess` with `sys.executable -m compose_doctor`:
  golden JSON for the insecure example, zero findings for the hardened example, SARIF structure,
  file discovery, stdin, every exit code, and the secret privacy test.

## 8. Security and privacy

- YAML is parsed with `yaml.compose` and `SafeLoader` only; no arbitrary objects are constructed.
- Document expansion is bounded (alias-bomb protection).
- Environment values are never printed.
- The only runtime dependency is PyYAML.

## 9. Limitations

- No merging of override files and no interpolation; interpolated values are treated as unknown,
  so a secret supplied through `${VAR}` with a literal default is not flagged.
- Comments are found by scanning raw text, so a `# compose-doctor:` marker inside a quoted
  multi-line string would be read as a suppression.

## 10. Prior art

- [hadolint](https://github.com/hadolint/hadolint) lints Dockerfiles.
- [Checkov](https://github.com/bridgecrewio/checkov) and [KICS](https://github.com/Checkmarx/kics)
  are broad infrastructure-as-code scanners that include Compose checks.
- `docker compose config` validates and renders a Compose file but does not lint it.

Compose Doctor focuses only on Compose, stays small and dependency-light, and gives accurate line
numbers, per-line suppressions and SARIF output.

## 11. Decisions

Judgment calls where the implementation brief was ambiguous or was overridden:

1. **GitHub remote.** The brief says never to add a remote or push. The project owner later asked
   for the code to live in a fresh GitHub repository, so the owner's instruction wins and the
   repository is pushed there.
2. **Milestone-0 CLI.** The scaffold milestone's CLI supports `--version` only; the full interface
   in §4 arrives with the CLI milestone.
3. **Repository URL.** The repository lives at `yagnang-vyas/compose-doctor` (it was first
   created as `yagnang-vyass/Compse-Doctor`), so project URLs, the CI badge and the SARIF
   `informationUri` use that location instead of the brief's `ChakraCoder/compose-doctor`. The package and command are still `compose-doctor`.
4. **Duplicate keys.** PyYAML silently keeps the last of two identical keys. Docker Compose
   rejects such files, and a silently dropped value hides mistakes, so the loader raises an
   `InputError` at the second key.
5. **Keys keep their source text.** Mapping keys are not typed: `on:` stays `"on"` rather than
   becoming `True`, and `80:` stays `"80"`.
6. **Tags outside the YAML core schema** (timestamps, binary, Compose's `!reset` and `!override`)
   keep their source text as a string. No other constructors are ever run.
7. **Recursive aliases and deep nesting.** A self-referencing anchor (`&a [*a]`) and nesting deeper
   than 100 levels raise `InputError` instead of exhausting the Python stack.
8. **One commit for all rules.** The brief splits the rules over two milestones (CD001–CD008,
   then CD009–CD015 and CD000). They share parsers and helpers that were written together, so they
   landed in one reviewed commit and pull request.
9. **CD009 only fires when the dependency has a healthcheck,** for both the short list form and the
   long form with `condition: service_started`. A dependency without a healthcheck cannot be waited
   on with `service_healthy`; CD007 already reports it, so it gets one finding, not two.
10. **CD007 treats `test: ["NONE"]` like `disable: true`:** both are explicit opt-outs and are
    reported as a note.
11. **CD008 also flags `deploy.restart_policy.condition: none`,** which means the same as
    `restart: "no"`.
12. **CD005 flags a port with no host port (`"5432"`),** because Docker publishes it on a random host
    port on every interface, and flags a specific non-loopback host IP such as `192.168.1.10`. A
    host IP that is interpolated (`${BIND_IP}:5432:5432`) is unknown and not flagged.
13. **CD000 checks more than ports.** It also reports entries the rules cannot read: malformed
    volumes, non-string environment list items, wrong value types for `ports`, `volumes`,
    `cap_add`, `security_opt`, `depends_on`, `environment` and `image`, unknown restart policies,
    and `depends_on` entries naming a service that does not exist. Its messages never quote
    environment values.
14. **YAML 1.1 sexagesimal ports.** An unquoted `22:22` is the integer 1342 in YAML 1.1. Port
    parsing reads the scalar's source text, so it is understood as `22:22`, as Docker Compose does.
15. **Line-above suppressions** apply only when the comment is on a line of its own. A trailing
    comment (`ports: # compose-doctor: ignore CD005`) covers its own line, not the next one, so a
    suppression never silently reaches further than it looks.
16. **Suppression comments are validated.** An unknown rule ID or an empty ID list in a
    `# compose-doctor:` comment is an input error (exit 2), like an unknown ID in the config file,
    so a typo cannot silently suppress nothing. A free-text reason may follow `--`.
17. **JSON findings include `column`.** It is additive to the shape in the brief and matches the
    `line:column` in text output and `startColumn` in SARIF. With `--show-suppressed`, JSON also
    gets a `suppressed` array whose entries add `"suppression": "inline" | "config"`.
18. **SARIF always includes suppressed results** (with `suppressions`), whether or not
    `--show-suppressed` is given, so code scanning shows them as dismissed. Standard input is
    reported with the URI `stdin`; a file outside the working directory gets an absolute `file://`
    URI.
19. **An input error stops the run.** If any file cannot be read or parsed, Compose Doctor reports
    that error and exits 2 without a partial report, so CI never treats an unparsed file as clean.
20. **Exit 130** is tested in-process (a `KeyboardInterrupt` raised inside the run); delivering a
    real SIGINT to a subprocess at the right moment cannot be done deterministically.
21. **README sections are generated.** `scripts/update_readme.py` writes the sample output, the
    JSON example and the rule table into README.md by running the CLI, and a test fails when they
    are stale, so the README cannot drift from the tool.
22. **Examples landed with the CLI milestone,** one step earlier than the brief's plan, because the
    golden and SARIF integration tests in that milestone run against them.
