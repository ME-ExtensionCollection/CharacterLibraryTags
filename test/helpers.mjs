// Shared test helpers: load extension/src/core.js the way Marinara does (plain
// script, no modules) and build mock catalogs from dev/mock-library.mjs.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { createMockApi } from "../dev/mock-library.mjs";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function loadCore() {
  const code = readFileSync(join(ROOT, "extension/src/core.js"), "utf8");
  // Same realm as the tests, so deepStrictEqual sees ordinary arrays and objects.
  return vm.runInThisContext(`(() => {\n${code}\n;return CLM;\n})()`, { filename: "core.js" });
}

/** Summary entries exactly as GET /api/characters/catalog?view=summary returns them. */
export function mockSummary(count = 3000, seed = 1) {
  const api = createMockApi({ count, seed });
  const [, body] = api.handle("GET", new URL("http://x/api/characters/catalog?view=summary"), null);
  return body.items;
}

/** A tiny hand-written catalog for exact assertions. */
export function tinyCatalog() {
  const at = (day) => `2026-01-${String(day).padStart(2, "0")}T00:00:00.000Z`;
  return [
    { id: "a", name: "Alice", creator: "Kestrel", tags: ["Female", "Elf", "Fantasy"], favorite: true, tokenEstimate: 900, createdAt: at(1), updatedAt: at(20) },
    { id: "b", name: "Bob", creator: "q", tags: ["Male", "Sci-Fi"], favorite: false, tokenEstimate: 2500, createdAt: at(2), updatedAt: at(3) },
    { id: "c", name: "Carol", creator: "", tags: [], favorite: false, tokenEstimate: 100, createdAt: at(3), updatedAt: at(4) },
    { id: "d", name: "Dark Dana", creator: "Kestrel", tags: ["female", "Dark Elf", "NSFW"], favorite: false, tokenEstimate: 4000, createdAt: at(4), updatedAt: at(5) },
    { id: "e", name: "alice two", creator: "anon", tags: ["Female", "Modern", "Dark Elf"], favorite: true, tokenEstimate: 1200, createdAt: at(5), updatedAt: at(6) },
    { id: "f", name: "Élodie", creator: "Kestrel Works", tags: ["FEMALE ", "Fantasy", "Romance"], favorite: false, tokenEstimate: 1800, createdAt: at(6), updatedAt: at(7) },
  ];
}
