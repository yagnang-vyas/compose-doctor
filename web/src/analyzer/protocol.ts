// Messages between the page and the analyzer worker.

import type { AnalysisResult, FailOn, RuleCatalog } from "./types";

export type RequestBody = { type: "init" } | { type: "analyze"; source: string; failOn: FailOn };

export type WorkerRequest = RequestBody & { id: number };

export type WorkerResponse =
  | { id: number; ok: true; type: "init"; catalog: RuleCatalog }
  | { id: number; ok: true; type: "analyze"; result: AnalysisResult; durationMs: number }
  | { id: number; ok: false; message: string };
