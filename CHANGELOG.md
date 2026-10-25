# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-25

### Added

- Located YAML loader built on `yaml.compose`: 1-based line and column for every key and list
  item, YAML 1.1 aliases and merge keys, and protection against alias bombs, recursive aliases and
  deep nesting.
- Sixteen rules: CD000 (invalid configuration) and CD001–CD015 covering image pinning, privileged
  mode, Docker socket and sensitive host mounts, host networking and namespaces, exposed database
  ports, hard-coded secrets, dangerous capabilities, disabled security profiles, healthchecks,
  restart policies, `depends_on` conditions, memory limits and fixed container names.
- Text, JSON (`schema_version` 1) and SARIF 2.1.0 output.
- Inline suppressions (`# compose-doctor: ignore ...`, `ignore-file`) and a `.compose-doctor.yml`
  config file with global and per-service ignores, severity overrides and `fail_on`.
- CLI with default-file discovery, standard input, `--fail-on`, `--ignore`, `--show-suppressed`,
  `--list-rules` and documented exit codes.
- Insecure and hardened example stacks, CI on Python 3.10–3.13, and a manually triggered SARIF
  upload workflow.

[0.1.0]: https://github.com/yagnang-vyass/Compse-Doctor/releases/tag/v0.1.0
