// Prepares the files the in-browser analyzer needs under public/runtime/ (git-ignored):
//
//   public/runtime/pyodide/           the Pyodide core, copied from node_modules/pyodide
//   public/runtime/pyyaml.tar.gz      the PyYAML source distribution, pinned and hash-checked
//
// Compose Doctor's only dependency is PyYAML, and it works without its optional C extension, so
// the pure-Python sources from the sdist are all the runtime needs. Serving both from the site
// itself keeps the playground working without any third-party CDN.

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PYODIDE_CORE_FILES, PYYAML } from "./runtime-config.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDir = join(root, "public", "runtime");
const require = createRequire(import.meta.url);

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

async function copyPyodide() {
  const source = dirname(require.resolve("pyodide/package.json"));
  const target = join(runtimeDir, "pyodide");
  await mkdir(target, { recursive: true });
  for (const name of PYODIDE_CORE_FILES) {
    await copyFile(join(source, name), join(target, name));
  }
}

async function fetchPyYaml() {
  const target = join(runtimeDir, PYYAML.file);
  try {
    if (sha256(await readFile(target)) === PYYAML.sha256) return;
  } catch {
    // Not downloaded yet.
  }
  const response = await fetch(PYYAML.url);
  if (!response.ok) {
    throw new Error(`Downloading ${PYYAML.url} failed: HTTP ${response.status}`);
  }
  const data = Buffer.from(await response.arrayBuffer());
  const digest = sha256(data);
  if (digest !== PYYAML.sha256) {
    throw new Error(`PyYAML checksum mismatch: expected ${PYYAML.sha256}, got ${digest}`);
  }
  await writeFile(target, data);
}

await mkdir(runtimeDir, { recursive: true });
await Promise.all([copyPyodide(), fetchPyYaml()]);
console.log(`Analyzer runtime ready in ${runtimeDir}`);
