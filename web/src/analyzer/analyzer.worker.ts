/// <reference lib="webworker" />
// Runs Compose Doctor inside Pyodide, off the main thread. The worker has no access to the page,
// cookies or storage; the page terminates it if an analysis runs past its time limit.

import { loadPyodide } from "pyodide";

import { PYYAML } from "../../scripts/runtime-config.mjs";
import type { WorkerRequest, WorkerResponse } from "./protocol";
import { type Analyzer, installAnalyzer } from "./runtime";

declare const self: DedicatedWorkerGlobalScope;

let analyzer: Promise<Analyzer> | undefined;

async function boot(): Promise<Analyzer> {
  const runtime = new URL(`${import.meta.env.BASE_URL}runtime/`, self.location.origin).href;
  const [pyodide, archive] = await Promise.all([
    loadPyodide({ indexURL: `${runtime}pyodide/`, stdout: () => {}, stderr: () => {} }),
    fetch(`${runtime}${PYYAML.file}`).then(async (response) => {
      if (!response.ok) throw new Error(`Could not load PyYAML (HTTP ${response.status})`);
      return new Uint8Array(await response.arrayBuffer());
    }),
  ]);
  return installAnalyzer(pyodide, archive, PYYAML.libDir);
}

function getAnalyzer(): Promise<Analyzer> {
  analyzer ??= boot();
  return analyzer;
}

function reply(message: WorkerResponse): void {
  self.postMessage(message);
}

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  void (async () => {
    try {
      const instance = await getAnalyzer();
      if (request.type === "init") {
        reply({ id: request.id, ok: true, type: "init", catalog: instance.rules() });
        return;
      }
      const started = performance.now();
      const result = instance.analyze(request.source, request.failOn);
      reply({
        id: request.id,
        ok: true,
        type: "analyze",
        result,
        durationMs: Math.round(performance.now() - started),
      });
    } catch (error) {
      reply({ id: request.id, ok: false, message: error instanceof Error ? error.message : String(error) });
    }
  })();
});
