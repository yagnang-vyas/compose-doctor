import { afterEach, describe, expect, it, vi } from "vitest";

import { AnalyzerClient, AnalyzerError, MAX_SOURCE_BYTES } from "./client";
import type { WorkerRequest, WorkerResponse } from "./protocol";
import type { AnalysisResult } from "./types";

const RESULT: AnalysisResult = {
  ok: false,
  exit_code: 2,
  error: { message: "file is empty", line: 1, display: "compose-doctor: error: compose.yaml:1: file is empty" },
};

/** A stand-in worker whose replies the test controls. */
class FakeWorker extends EventTarget {
  sent: WorkerRequest[] = [];
  terminated = false;
  constructor(private readonly respond: (request: WorkerRequest) => WorkerResponse | null) {
    super();
  }
  postMessage(request: WorkerRequest) {
    this.sent.push(request);
    const response = this.respond(request);
    if (response) queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", { data: response })));
  }
  terminate() {
    this.terminated = true;
  }
}

const catalog = { version: "0.1.0", rules: [] };

function respondAll(request: WorkerRequest): WorkerResponse {
  return request.type === "init"
    ? { id: request.id, ok: true, type: "init", catalog }
    : { id: request.id, ok: true, type: "analyze", result: RESULT, durationMs: 3 };
}

afterEach(() => vi.useRealTimers());

describe("AnalyzerClient", () => {
  it("boots once and routes replies to their requests", async () => {
    const workers: FakeWorker[] = [];
    const client = new AnalyzerClient(() => {
      const worker = new FakeWorker(respondAll);
      workers.push(worker);
      return worker as unknown as Worker;
    });
    await expect(client.init()).resolves.toEqual(catalog);
    await expect(client.analyze("services: {}", "error")).resolves.toEqual({ result: RESULT, durationMs: 3 });
    expect(workers).toHaveLength(1);
    expect(workers[0].sent.map((request) => request.type)).toEqual(["init", "analyze"]);
  });

  it("rejects oversized input without contacting the worker", async () => {
    const factory = vi.fn();
    const client = new AnalyzerClient(factory);
    const error = await client.analyze("x".repeat(MAX_SOURCE_BYTES + 1), "error").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AnalyzerError);
    expect((error as AnalyzerError).kind).toBe("too-large");
    expect(factory).not.toHaveBeenCalled();
  });

  it("terminates and replaces a worker whose analysis times out", async () => {
    vi.useFakeTimers();
    const workers: FakeWorker[] = [];
    const client = new AnalyzerClient(() => {
      // The first worker never answers an analysis; later ones answer everything.
      const hang = workers.length === 0;
      const worker = new FakeWorker((request) => (hang && request.type === "analyze" ? null : respondAll(request)));
      workers.push(worker);
      return worker as unknown as Worker;
    });
    const pending = client.analyze("services: {}", "error").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10_001);
    const error = await pending;
    expect((error as AnalyzerError).kind).toBe("timeout");
    expect(workers[0].terminated).toBe(true);
    await expect(client.analyze("services: {}", "error")).resolves.toMatchObject({ result: RESULT });
    expect(workers).toHaveLength(2);
  });

  it("surfaces errors reported by the worker", async () => {
    const client = new AnalyzerClient(
      () => new FakeWorker((request) => ({ id: request.id, ok: false, message: "boom" })) as unknown as Worker,
    );
    await expect(client.init()).rejects.toThrow("boom");
  });
});
