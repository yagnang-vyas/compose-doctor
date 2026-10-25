// Installs Compose Doctor into a Pyodide instance and exposes typed calls into bridge.py.
// Shared by the browser worker and the Node-side tests, so both exercise the same code path.

import type { PyodideAPI } from "pyodide";

import { BRIDGE_MODULE, PYTHON_FILES } from "./sources";
import type { AnalysisResult, FailOn, RuleCatalog } from "./types";

const IMPORT_ROOT = "/home/pyodide/compose-doctor";
const PYYAML_ROOT = "/home/pyodide/pyyaml";

export interface Analyzer {
  analyze(source: string, failOn: FailOn): AnalysisResult;
  rules(): RuleCatalog;
}

/** The file name findings are reported against, as if the user ran `compose-doctor compose.yaml`. */
export const PLAYGROUND_FILENAME = "compose.yaml";

export function installAnalyzer(
  pyodide: PyodideAPI,
  pyyamlArchive: ArrayBuffer | Uint8Array,
  pyyamlLibDir: string,
  filename: string = PLAYGROUND_FILENAME,
): Analyzer {
  const bytes = pyyamlArchive instanceof Uint8Array ? pyyamlArchive : new Uint8Array(pyyamlArchive);
  // A server may have sent the .tar.gz with Content-Encoding: gzip, so fetch already inflated it.
  const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b;
  pyodide.unpackArchive(bytes, gzipped ? "gztar" : "tar", { extractDir: PYYAML_ROOT });
  for (const [relativePath, source] of Object.entries(PYTHON_FILES)) {
    const path = `${IMPORT_ROOT}/${relativePath}`;
    pyodide.FS.mkdirTree(path.slice(0, path.lastIndexOf("/")));
    pyodide.FS.writeFile(path, source);
  }
  pyodide.runPython(`
import sys
for entry in (${JSON.stringify(IMPORT_ROOT)}, ${JSON.stringify(`${PYYAML_ROOT}/${pyyamlLibDir}`)}):
    if entry not in sys.path:
        sys.path.insert(0, entry)
`);
  const bridge = pyodide.pyimport(BRIDGE_MODULE) as {
    analyze(source: string, filename: string, failOn: string): string;
    rules(): string;
  };
  return {
    analyze: (source, failOn) => JSON.parse(bridge.analyze(source, filename, failOn)) as AnalysisResult,
    rules: () => JSON.parse(bridge.rules()) as RuleCatalog,
  };
}
