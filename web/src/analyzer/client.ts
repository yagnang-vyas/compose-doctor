// Page-side client for the analyzer worker: boots it lazily, matches replies to requests,
// enforces the input size limit and replaces the worker when an analysis times out.

import type { RequestBody, WorkerRequest, WorkerResponse } from "./protocol";
import type { AnalysisResult, FailOn, RuleCatalog } from "./types";

/** Largest input the playground accepts. Real Compose files are a few kilobytes. */
export const MAX_SOURCE_BYTES = 200 * 1024;
/** Time limit for one analysis once the runtime is ready. */
export const ANALYSIS_TIMEOUT_MS = 10_000;
/** Time limit for downloading and starting the runtime. */
export const BOOT_TIMEOUT_MS = 90_000;

export class AnalyzerError extends Error {
  constructor(
    message: string,
    readonly kind: "too-large" | "timeout" | "runtime",
  ) {
    super(message);
    this.name = "AnalyzerError";
  }
}

export interface AnalysisOutcome {
  result: AnalysisResult;
  durationMs: number;
}

type Pending = {
  resolve: (response: WorkerResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export type WorkerFactory = () => Worker;

const defaultFactory: WorkerFactory = () =>
  new Worker(new URL("./analyzer.worker.ts", import.meta.url), {
    type: "module",
    name: "compose-doctor-analyzer",
  });

export function byteLength(source: string): number {
  return new TextEncoder().encode(source).length;
}

export class AnalyzerClient {
  private worker: Worker | undefined;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private catalog: Promise<RuleCatalog> | undefined;

  constructor(private readonly createWorker: WorkerFactory = defaultFactory) {}

  /** Boot the runtime (once) and return the rule catalogue from the analyzer. */
  init(): Promise<RuleCatalog> {
    this.catalog ??= this.request({ type: "init" }, BOOT_TIMEOUT_MS).then((response) => {
      if (response.ok && response.type === "init") return response.catalog;
      throw new AnalyzerError("Unexpected reply from the analyzer", "runtime");
    });
    this.catalog.catch(() => {
      this.catalog = undefined;
    });
    return this.catalog;
  }

  async analyze(source: string, failOn: FailOn): Promise<AnalysisOutcome> {
    const size = byteLength(source);
    if (size > MAX_SOURCE_BYTES) {
      throw new AnalyzerError(
        `The file is ${formatKiB(size)}; the playground accepts up to ${formatKiB(MAX_SOURCE_BYTES)}. Run the CLI for larger files.`,
        "too-large",
      );
    }
    await this.init();
    const response = await this.request({ type: "analyze", source, failOn }, ANALYSIS_TIMEOUT_MS);
    if (response.ok && response.type === "analyze") {
      return { result: response.result, durationMs: response.durationMs };
    }
    throw new AnalyzerError("Unexpected reply from the analyzer", "runtime");
  }

  dispose(): void {
    this.reset(new AnalyzerError("The analyzer was stopped", "runtime"));
  }

  private request(body: RequestBody, timeoutMs: number): Promise<WorkerResponse> {
    const worker = this.ensureWorker();
    const id = this.nextId++;
    return new Promise<WorkerResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        // A runaway analysis cannot be interrupted inside Pyodide, so replace the whole worker.
        this.reset(
          new AnalyzerError(
            `The analysis did not finish within ${Math.round(timeoutMs / 1000)} seconds and was stopped.`,
            "timeout",
          ),
        );
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      const message: WorkerRequest = { ...body, id };
      worker.postMessage(message);
    }).then((response) => {
      if (!response.ok) throw new AnalyzerError(response.message, "runtime");
      return response;
    });
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = this.createWorker();
    worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      const pending = this.pending.get(event.data.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(event.data.id);
      pending.resolve(event.data);
    });
    worker.addEventListener("error", (event) => {
      event.preventDefault();
      this.reset(new AnalyzerError(event.message || "The analyzer failed to start", "runtime"));
    });
    this.worker = worker;
    return worker;
  }

  private reset(error: AnalyzerError): void {
    this.worker?.terminate();
    this.worker = undefined;
    this.catalog = undefined;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

export function formatKiB(bytes: number): string {
  return `${Math.ceil(bytes / 1024)} KiB`;
}
