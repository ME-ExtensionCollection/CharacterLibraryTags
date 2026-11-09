// Browser smoke test against the dev harness (mock Marinara, mock library).
//
// Needs `node scripts/serve.mjs` running, plus playwright-core and a Chromium:
//   CLM_PLAYWRIGHT=/path/to/node_modules/playwright-core   (default: import "playwright-core")
//   CLM_CHROME=/usr/bin/google-chrome-stable              (default: Playwright's own browser)
//   CLM_SHOTS=/some/dir                                   (optional screenshots)
// Usage: node scripts/smoke.mjs [baseUrl] [--only=name,name]
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const BASE = args.find((a) => !a.startsWith("--")) ?? "http://localhost:5179";
const only = args.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const pw = await import(
  process.env.CLM_PLAYWRIGHT ? pathToFileURL(join(process.env.CLM_PLAYWRIGHT, "index.mjs")).href : "playwright-core"
);
const shots = process.env.CLM_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

const browser = await pw.chromium.launch({ executablePath: process.env.CLM_CHROME || undefined, headless: true });
let failed = 0;

async function withPage(name, fn, { query = "", viewport = { width: 1440, height: 900 } } = {}) {
  if (only && !only.includes(name)) return;
  await fetch(`${BASE}/__mock/reset`, { method: "POST" });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const shot = async (label) => shots && page.screenshot({ path: join(shots, `${name}-${label}.png`) });
  try {
    await page.goto(`${BASE}/dev/harness.html${query}`);
    await page.waitForFunction(() => document.querySelector("#mock-open-library"));
    await fn(page, shot);
    assert.deepEqual(errors, [], "page errors");
    console.log(`ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}\n     ${String(error?.stack ?? error).split("\n").slice(0, 6).join("\n     ")}`);
    await shot("failure");
  } finally {
    await context.close();
  }
}

// ── v0.3 inline tag filter panel still works ──
await withPage("filter-panel", async (page, shot) => {
  await page.click("#mock-open-library");
  await page.waitForSelector(".clt-toggle");
  await page.click(".clt-toggle");
  await page.fill("#clt-required-input", "female");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("[data-component=CharacterLibraryView] input").value.toLowerCase().includes('"female"'));
  await shot("panel");
});

const smokeTests = await import("./smoke-manager.mjs").catch((error) => {
  if (error.code === "ERR_MODULE_NOT_FOUND") return null;
  throw error;
});
if (smokeTests) await smokeTests.default({ withPage, assert, BASE });

await browser.close();
if (failed) {
  console.log(`${failed} smoke test(s) failed`);
  process.exit(1);
}
console.log("smoke ok");
