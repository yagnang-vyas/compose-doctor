/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The analyzer's Python sources and the example stacks live outside web/.
  server: { fs: { allow: [repoRoot] } },
  worker: { format: "es" },
  // Keep fonts as files so the Content-Security-Policy can stay at font-src 'self'.
  build: { assetsInlineLimit: (file) => (file.endsWith(".woff2") ? false : undefined) },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // Booting Pyodide in the analyzer tests takes a few seconds.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
