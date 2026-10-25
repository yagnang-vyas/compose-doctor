// @vitest-environment node
// Runs the real analyzer in Pyodide (the same runtime the browser uses) and compares it with the
// CLI's committed golden output, so the playground provably reports what `compose-doctor` reports.

import { readFile } from "node:fs/promises";

import { loadPyodide } from "pyodide";
import { beforeAll, describe, expect, it } from "vitest";

import { PYYAML } from "../../scripts/runtime-config.mjs";
import { EXAMPLES } from "../examples";
import snapshot from "../generated/analyzer-snapshot.json";
import { type Analyzer, installAnalyzer } from "./runtime";

const repo = new URL("../../../", import.meta.url);
const read = (path: string) => readFile(new URL(path, repo), "utf-8");

let analyzer: Analyzer;
let golden: Analyzer;

beforeAll(async () => {
  const file = await readFile(new URL(`public/runtime/${PYYAML.file}`, new URL("../../", import.meta.url)));
  const archive = new Uint8Array(file.buffer, file.byteOffset, file.byteLength);
  const pyodide = await loadPyodide();
  analyzer = installAnalyzer(pyodide, archive, PYYAML.libDir);
  golden = installAnalyzer(pyodide, archive, PYYAML.libDir, "examples/insecure/compose.yaml");
});

describe("analyzer in Pyodide", () => {
  it("matches the CLI's golden JSON for the insecure example", async () => {
    const result = golden.analyze(await read("examples/insecure/compose.yaml"), "error");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expected: unknown = JSON.parse(await read("tests/golden/insecure.json"));
    const { suppressed, ...report } = result.report;
    expect(suppressed).toEqual([]);
    expect(report).toEqual(expected);
    expect(result.exit_code).toBe(1);
    expect(result.services).toEqual(["web", "db", "cache", "worker", "adminer"]);
  });

  it("reports the hardened example as clean, like the CLI", async () => {
    const result = analyzer.analyze(await read("examples/hardened/compose.yaml"), "error");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.findings).toEqual([]);
    expect(result.text).toBe("No problems found in 1 file.\n");
    expect(result.exit_code).toBe(0);
  });

  it("returns the CLI's input error for invalid YAML", () => {
    const result = analyzer.analyze("services:\n  web: [\n", "error");
    expect(result).toMatchObject({ ok: false, exit_code: 2, error: { line: 3 } });
    if (result.ok) return;
    expect(result.error.display).toMatch(/^compose-doctor: error: compose\.yaml:3: invalid YAML/);
  });

  it("rejects alias bombs instead of expanding them", () => {
    const levels = ["a: &a [x, x, x, x, x, x, x, x, x, x]"];
    for (let i = 1; i < 9; i += 1) {
      const prev = String.fromCharCode(96 + i);
      const name = String.fromCharCode(97 + i);
      levels.push(`${name}: &${name} [${Array(10).fill(`*${prev}`).join(", ")}]`);
    }
    const result = analyzer.analyze(`${levels.join("\n")}\nservices: {}\n`, "error");
    expect(result).toMatchObject({ ok: false, error: { message: "document expands to too many nodes" } });
  });

  it("honours inline suppressions and the fail-on threshold", () => {
    const source = [
      "services:",
      "  web:",
      "    image: nginx:1.27",
      "    restart: always",
      "    mem_limit: 128m",
      "    container_name: web  # compose-doctor: ignore CD015",
      "",
    ].join("\n");
    const result = analyzer.analyze(source, "note");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.findings).toEqual([]);
    expect(result.report.suppressed).toMatchObject([{ rule_id: "CD015", suppression: "inline" }]);
    expect(result.exit_code).toBe(0);
  });

  it("lists every rule from the registry", () => {
    const catalog = analyzer.rules();
    expect(catalog.version).toBe("0.1.0");
    expect(catalog.rules.map((rule) => rule.id)).toEqual(
      Array.from({ length: 16 }, (_, i) => `CD${String(i).padStart(3, "0")}`),
    );
  });

  it("never echoes secret values from the input", () => {
    const result = analyzer.analyze(
      "services:\n  app:\n    image: app:1.0\n    environment:\n      DB_PASSWORD: fake-pass-123\n",
      "error",
    );
    expect(JSON.stringify(result)).not.toContain("fake-pass-123");
  });
});

describe("playground examples", () => {
  it.each(EXAMPLES.map((example) => [example.id, example] as const))(
    "%s produces the documented outcome",
    (_id, example) => {
      const result = analyzer.analyze(example.source, "error");
      const { outcome } = example;
      if (outcome.kind === "input-error") {
        expect(result.ok).toBe(false);
        return;
      }
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const unique = (ids: string[]) => [...new Set(ids)].sort();
      if (outcome.kind === "clean") {
        expect(result.report.findings).toEqual([]);
        expect(result.report.suppressed).toEqual([]);
        return;
      }
      expect(unique(result.report.findings.map((f) => f.rule_id))).toEqual([...outcome.rules].sort());
      expect(unique(result.report.suppressed.map((f) => f.rule_id))).toEqual(
        [...(outcome.suppressed ?? [])].sort(),
      );
    },
  );
});

describe("generated snapshot", () => {
  // If this fails, run: python web/scripts/export_snapshot.py
  it("matches the analyzer's rule catalogue", () => {
    const catalog = analyzer.rules();
    expect(snapshot.version).toBe(catalog.version);
    expect(snapshot.rules).toEqual(catalog.rules);
  });

  it("matches the analyzer's output for the preview file", () => {
    const result = analyzer.analyze(snapshot.preview.source, "error");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(snapshot.preview.report).toEqual(result.report);
    expect(snapshot.preview.text).toBe(result.text);
  });
});

describe("rendered reports", () => {
  it("returns the CLI's JSON rendering and valid SARIF", async () => {
    const result = analyzer.analyze(await read("examples/insecure/compose.yaml"), "error");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.parse(result.json)).toEqual(result.report);
    const sarif = JSON.parse(result.sarif) as { version: string; runs: { results: unknown[] }[] };
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0].results).toHaveLength(result.report.findings.length);
  });
});
