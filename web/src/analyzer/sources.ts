// The Python sources the playground runs: the compose_doctor package straight from the
// repository's src/ directory (bundled at build time, never copied by hand) plus bridge.py.

import bridgeSource from "./bridge.py?raw";

const packageModules = import.meta.glob<string>("../../../src/compose_doctor/**/*.py", {
  query: "?raw",
  import: "default",
  eager: true,
});

const PACKAGE_PREFIX = "../../../src/";

/** Python files keyed by their path relative to the import root, e.g. "compose_doctor/cli.py". */
export const PYTHON_FILES: Readonly<Record<string, string>> = {
  ...Object.fromEntries(
    Object.entries(packageModules).map(([path, source]) => [
      path.slice(PACKAGE_PREFIX.length),
      source,
    ]),
  ),
  "compose_doctor_playground_bridge.py": bridgeSource,
};

export const BRIDGE_MODULE = "compose_doctor_playground_bridge";
