import { useCallback, useEffect, useRef, useState } from "react";

import { type AnalysisOutcome, AnalyzerClient, AnalyzerError } from "./client";
import type { FailOn, RuleCatalog } from "./types";

export type RuntimeState =
  | { status: "loading" }
  | { status: "ready"; catalog: RuleCatalog }
  | { status: "failed"; message: string };

interface Options {
  /** Called each time the runtime finishes starting. */
  onReady?: (catalog: RuleCatalog) => void;
  createClient?: () => AnalyzerClient;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Owns one analyzer worker for the lifetime of the calling component. */
export function useAnalyzer({ onReady, createClient = () => new AnalyzerClient() }: Options = {}) {
  const [client] = useState(createClient);
  const [runtime, setRuntime] = useState<RuntimeState>({ status: "loading" });
  const mounted = useRef(false);
  // Only the latest start may update state; an earlier one can settle after a restart.
  const generation = useRef(0);
  const readyCallback = useRef(onReady);

  useEffect(() => {
    readyCallback.current = onReady;
  });

  const start = useCallback(() => {
    const current = ++generation.current;
    const isLatest = () => mounted.current && current === generation.current;
    client.init().then(
      (catalog) => {
        if (!isLatest()) return;
        setRuntime({ status: "ready", catalog });
        readyCallback.current?.(catalog);
      },
      (error: unknown) => {
        if (isLatest()) setRuntime({ status: "failed", message: message(error) });
      },
    );
  }, [client]);

  const restart = useCallback(() => {
    setRuntime({ status: "loading" });
    start();
  }, [start]);

  useEffect(() => {
    mounted.current = true;
    start();
    return () => {
      mounted.current = false;
      client.dispose();
    };
  }, [client, start]);

  const analyze = useCallback(
    async (source: string, failOn: FailOn): Promise<AnalysisOutcome> => {
      try {
        return await client.analyze(source, failOn);
      } catch (error) {
        // A timeout or crash replaces the worker; start the replacement so the next run is ready.
        if (mounted.current && !(error instanceof AnalyzerError && error.kind === "too-large")) restart();
        throw error;
      }
    },
    [client, restart],
  );

  return { runtime, analyze, restart };
}
