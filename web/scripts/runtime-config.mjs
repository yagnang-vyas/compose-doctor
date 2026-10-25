// Pinned runtime inputs shared by prepare-runtime.mjs and the Node-side analyzer tests.

export const PYODIDE_CORE_FILES = [
  "pyodide.mjs",
  "pyodide.asm.mjs",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
  "pyodide-lock.json",
];

export const PYYAML = {
  version: "6.0.3",
  file: "pyyaml.tar.gz",
  url: "https://files.pythonhosted.org/packages/05/8e/961c0007c59b8dd7729d542c61a4d537767a59645b82a0b521206e1e25c2/pyyaml-6.0.3.tar.gz",
  sha256: "d76623373421df22fb4cf8817020cbb7ef15c725b9d5e45f17e189bfc384190f",
  // Directory inside the archive that holds the importable `yaml` package.
  libDir: "pyyaml-6.0.3/lib",
};
