// End-to-end checks against the production build, served the way Netlify serves it
// (including the Content-Security-Policy from public/_headers). Run `npm run build` first.
//
//   node scripts/e2e.mjs [--screenshots DIR]
//
// Uses the Playwright Chromium build; set PLAYWRIGHT_CHROMIUM_PATH to use another binary.

import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import { startServer } from "./serve.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(root, "..");
const shotsIndex = process.argv.indexOf("--screenshots");
const shots = shotsIndex > 0 ? process.argv[shotsIndex + 1] : undefined;
if (shots) await mkdir(shots, { recursive: true });

const server = await startServer(0);
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
);

const problems = [];
const results = [];

async function newPage(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console error on ${page.url()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`page error on ${page.url()}: ${error.message}`));
  page.on("request", (request) => {
    if (!request.url().startsWith(origin)) problems.push(`external request: ${request.url()}`);
  });
  return page;
}

async function check(name, run) {
  const started = Date.now();
  try {
    await run();
    results.push(`ok   ${name} (${Date.now() - started} ms)`);
  } catch (error) {
    results.push(`FAIL ${name}\n     ${error.message.split("\n").join("\n     ")}`);
    process.exitCode = 1;
  }
}

async function screenshot(page, name, fullPage = false) {
  if (shots) await page.screenshot({ path: join(shots, `${name}.png`), fullPage });
}

const analyzerReady = (page) => page.getByText(/^compose-doctor \d+\.\d+\.\d+$/).waitFor({ timeout: 90_000 });
const exampleSelect = (page) => page.getByLabel("Example configuration");

async function reportJson(page) {
  await page.getByRole("tab", { name: "JSON" }).click();
  const text = await page.getByLabel("JSON report").textContent();
  await page.getByRole("tab", { name: "Findings" }).click();
  return JSON.parse(text);
}

try {
  await check("landing page renders with working internal links", async () => {
    const page = await newPage();
    await page.goto(`${origin}/`);
    await page.getByRole("heading", { level: 1, name: /Catch Docker Compose issues/ }).waitFor();
    await screenshot(page, "home", true);
    const hrefs = await page.$$eval("a[href^='/']", (links) => [...new Set(links.map((a) => a.getAttribute("href")))]);
    assert.ok(hrefs.length >= 5, "expected internal links");
    for (const href of hrefs) {
      await page.goto(`${origin}${href}`);
      assert.equal(await page.getByText("Page not found").count(), 0, `${href} rendered the 404 page`);
    }
    const external = await page.$$eval("a[target=_blank]", (links) => links.map((a) => a.rel));
    assert.ok(external.every((rel) => rel.includes("noopener")), "external links need rel=noopener");
    await page.context().close();
  });

  await check("unknown routes render the 404 page", async () => {
    const page = await newPage();
    await page.goto(`${origin}/does-not-exist`);
    await page.getByRole("heading", { name: "Page not found" }).waitFor();
    await page.context().close();
  });

  await check("docs list every rule", async () => {
    const page = await newPage();
    await page.goto(`${origin}/docs#cd005`);
    await page.getByRole("heading", { name: "Getting started" }).waitFor();
    assert.equal(await page.locator("li[id^='cd0']").count(), 16);
    await screenshot(page, "docs");
    await page.context().close();
  });

  const page = await newPage();

  await check("playground analyzes the default example exactly like the CLI", async () => {
    await page.goto(`${origin}/playground`);
    await analyzerReady(page);
    await page.getByRole("heading", { name: /^Errors/ }).waitFor({ timeout: 30_000 });
    const report = await reportJson(page);
    const golden = JSON.parse(await readFile(join(repo, "tests/golden/insecure.json"), "utf-8"));
    const normalize = (findings) => findings.map((f) => ({ ...f, file: "compose.yaml" }));
    assert.deepEqual(normalize(report.findings), normalize(golden.findings));
    assert.deepEqual(report.summary, golden.summary);
    await screenshot(page, "playground");
  });

  await check("finding details show the rule rationale and fix", async () => {
    await page.getByRole("button", { name: /Container runs in privileged mode/ }).click();
    await page.getByText("Why it matters").waitFor();
    await page.getByText("Remove 'privileged: true'").first().waitFor();
    await page.getByRole("button", { name: /Go to line 40, column 5/ }).click();
    const active = await page.locator(".cm-activeLine").textContent();
    assert.match(active, /privileged: true/);
  });

  await check("severity filter narrows the list", async () => {
    await page.getByRole("button", { name: /^Notes/ }).click();
    const items = await page.getByRole("button", { name: /Go to line/ }).count();
    assert.equal(items, 6);
    await page.getByRole("button", { name: /^All/ }).click();
  });

  await check("hardened example shows a clean result", async () => {
    await exampleSelect(page).selectOption("hardened");
    await page.getByText("No problems found", { exact: true }).waitFor();
    assert.match(page.url(), /example=hardened/);
  });

  await check("malformed YAML shows the CLI's input error, not findings", async () => {
    await exampleSelect(page).selectOption("malformed");
    const alert = page.getByRole("alert").filter({ hasText: "could not read this file" });
    await alert.waitFor();
    assert.match(await alert.textContent(), /compose-doctor: error: compose\.yaml:6: invalid YAML/);
    await screenshot(page, "playground-error");
  });

  await check("an empty editor is rejected before analysis", async () => {
    await page.getByRole("button", { name: "Clear editor" }).click();
    await page.getByRole("button", { name: "Analyze configuration" }).click();
    await page.getByText("The editor is empty").waitFor();
  });

  await check("typing and Ctrl+Enter analyzes the edited file", async () => {
    await page.locator(".cm-content").click();
    await page.keyboard.insertText("services:\n  db:\n    image: postgres:16.4\n    ports:\n      - \"5432:5432\"\n");
    await page.keyboard.press("Control+Enter");
    await page.getByText("PostgreSQL container port 5432 is published on all interfaces").waitFor();
    const report = await reportJson(page);
    assert.deepEqual(
      report.findings.map((f) => f.rule_id),
      ["CD007", "CD008", "CD010", "CD005"],
    );
  });

  await check("--fail-on changes the reported exit code", async () => {
    await page.getByRole("combobox", { name: /fail-on/ }).selectOption("never");
    await page.getByText(/--fail-on never exits\s*0/).waitFor();
  });

  await check("the edited draft survives a reload", async () => {
    await page.waitForTimeout(600);
    await page.reload();
    await analyzerReady(page);
    assert.match(await page.locator(".cm-content").textContent(), /postgres:16\.4/);
  });

  await check("dark theme renders", async () => {
    await page.getByRole("radio", { name: "Dark theme" }).click();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
    await exampleSelect(page).selectOption("suppressions");
    await page.getByText(/Suppressed/).first().waitFor();
    await screenshot(page, "playground-dark");
  });

  await check("YAML never leaves the browser", async () => {
    // External requests are recorded as problems; same-origin requests must be static files.
    const posts = [];
    page.on("request", (request) => request.method() !== "GET" && posts.push(request.url()));
    await exampleSelect(page).selectOption("security");
    await page.getByText("Container runs in privileged mode").waitFor();
    assert.deepEqual(posts, []);
  });
  await page.context().close();

  await check("no horizontal overflow on a phone", async () => {
    const phone = await newPage({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    for (const path of ["/", "/playground", "/docs", "/examples"]) {
      await phone.goto(`${origin}${path}`);
      if (path === "/playground") await analyzerReady(phone);
      const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 0, `${path} overflows by ${overflow}px`);
      await screenshot(phone, `mobile${path.replace(/\//g, "-") || "-home"}`, true);
    }
    await phone.getByRole("button", { name: "Open menu" }).click();
    await phone.locator("#mobile-nav").getByRole("link", { name: "Docs" }).click();
    await phone.getByRole("heading", { name: "Getting started" }).waitFor();
    await phone.context().close();
  });

  await check("no console errors, CSP violations or third-party requests", async () => {
    assert.deepEqual(problems, []);
  });
} finally {
  await browser.close();
  server.close();
}

console.log(results.join("\n"));
