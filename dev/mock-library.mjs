// Mock character library for the dev harness and tests. Never real cards.
//
// Builds deterministic characters whose tags come from
// test/fixtures/st-sample-tags.json (the SillyTavern sample tag list Tag Merger
// also uses), and answers the Marinara character routes the extension calls,
// mirroring packages/server/src/services/storage/character-catalog.ts.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** mulberry32: small deterministic PRNG so mock libraries are reproducible. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Mirrors normalizeTextForMatch in packages/shared/src/utils/text-matching.ts.
export const normalizeTextForMatch = (value) =>
  typeof value === "string" ? value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/gu, " ") : "";

// Mirrors parseCardTagSearchTerms / matchesAllCardSearchTags.
function parseCardTagSearchTerms(text) {
  const terms = Array.from(normalizeTextForMatch(text).matchAll(/"([^"]+)"|([^\s,"]+)/gu), (m) =>
    normalizeTextForMatch(m[1] ?? m[2]),
  );
  return [...new Set(terms.filter(Boolean))];
}
function matchesAllCardSearchTags(tags, terms) {
  if (!Array.isArray(tags) || terms.length === 0) return false;
  const set = new Set(tags.map(normalizeTextForMatch));
  return terms.every((term) => set.has(term));
}

const SYLLABLES = ["ka", "ri", "mo", "na", "el", "ys", "tha", "lia", "vor", "zen", "aki", "ro", "sa", "mi", "do", "ra", "ve", "lu", "th", "an", "is", "or", "ae", "ky"];
const CREATORS = ["", "", "anon", "Velvet", "MoonFox", "chub_writer", "Kestrel", "ArcanaWorks", "pixie", "Rook", "Seraph", "dustbunny", "Tamsin", "LoreSmith", "nyx", "Old Man Willow", "q", "cardsmith"];
const WORDS = "the a an of in on with and but she he they her his their city forest tower rival friend mentor sword magic secret quiet loud stubborn gentle cold warm clever lost found ancient modern school office kingdom ship storm night morning tea coffee book letter promise debt curse".split(" ");

function sentence(rand, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(WORDS[Math.floor(rand() * WORDS.length)]);
  const s = out.join(" ");
  return s[0].toUpperCase() + s.slice(1) + ".";
}

function makeName(rand, n) {
  const parts = 2 + Math.floor(rand() * 2);
  let name = "";
  for (let i = 0; i < parts; i++) name += SYLLABLES[Math.floor(rand() * SYLLABLES.length)];
  name = name[0].toUpperCase() + name.slice(1);
  if (rand() < 0.3) {
    let last = "";
    for (let i = 0; i < 2; i++) last += SYLLABLES[Math.floor(rand() * SYLLABLES.length)];
    name += ` ${last[0].toUpperCase()}${last.slice(1)}`;
  }
  return n % 97 === 0 ? `${name} (alt)` : name;
}

/**
 * @param {{count?: number, seed?: number}} options
 * @returns {Array<object>} full mock rows, `data` already parsed
 */
export function buildLibrary({ count = 3000, seed = 1 } = {}) {
  const { allTags } = JSON.parse(readFileSync(join(ROOT, "test/fixtures/st-sample-tags.json"), "utf8"));
  const rand = rng(seed);
  const cards = [];
  const start = Date.parse("2023-01-01T00:00:00Z");
  const span = Date.parse("2026-11-01T00:00:00Z") - start;
  let cursor = 0;
  for (let n = 0; n < count; n++) {
    const size = rand() < 0.04 ? 0 : 2 + Math.floor(rand() * 16);
    if (cursor + size > allTags.length) cursor = Math.floor(rand() * 200);
    const tags = [...new Set(allTags.slice(cursor, cursor + size))];
    cursor += size;
    const created = start + Math.floor(rand() * span);
    const updated = created + Math.floor(rand() * Math.max(0, start + span - created));
    const name = makeName(rand, n);
    cards.push({
      id: `mock-${String(n).padStart(5, "0")}`,
      comment: rand() < 0.1 ? "imported" : "",
      avatarPath: rand() < 0.9 ? `/mock-avatar/mock-${String(n).padStart(5, "0")}.svg` : null,
      createdAt: new Date(created).toISOString(),
      updatedAt: new Date(updated).toISOString(),
      data: {
        name,
        creator: CREATORS[Math.floor(rand() * CREATORS.length)],
        character_version: rand() < 0.5 ? "" : `1.${Math.floor(rand() * 5)}`,
        tags,
        description: `${name} is ${sentence(rand, 6 + Math.floor(rand() * 30))} ${sentence(rand, 12)}`,
        personality: sentence(rand, 8),
        scenario: sentence(rand, 10),
        first_mes: `*${name} looks up.* ${sentence(rand, 12)}`,
        creator_notes: rand() < 0.6 ? sentence(rand, 14) : "",
        summary: "",
        extensions: { fav: rand() < 0.06, nameColor: rand() < 0.1 ? "#e6a23c" : undefined },
        // Lets token sorting spread out without huge descriptions.
        _tokenPad: Math.floor(rand() * 6000),
      },
    });
  }
  // Where the special cards came from (see CLM.sourceLinks).
  const SPECIAL_SOURCES = [
    { botBrowserSource: "chub:kestrel/alice-1234", chub: { id: "kestrel/alice-1234" } },
    { chub: { full_path: "q/alice-in-chains" } },
    { char_importer: { source_url: "https://botbooru.com/character/31337" }, botbooru: { post_id: 31337, full_path: "uploader/31337" } },
    { botBrowserSource: "janny:9f2c" },
    {},
  ];
  // A few hand-made cards worth seeing.
  const special = [
    { name: "Alice", tags: ["Female", "Fantasy", "Elf"], creator: "Kestrel" },
    { name: "Alice in Chains", tags: ["Male", "Music"], creator: "q" },
    { name: "Untagged Ursula", tags: [], creator: "" },
    { name: 'Quote "Quinn"', tags: ['tag with "quotes"', "Female"], creator: "anon" },
    { name: "Messy Mel", tags: ["#female", "FEMALE ", "dark elf", "Dark Elf"], creator: "pixie" },
  ];
  special.forEach((s, i) =>
    cards.push({
      id: `special-${i}`,
      comment: "",
      avatarPath: null,
      createdAt: "2026-10-30T12:00:00.000Z",
      updatedAt: "2026-10-31T12:00:00.000Z",
      data: {
        name: s.name,
        creator: s.creator,
        character_version: "",
        tags: s.tags,
        description: `${s.name} hides a needle-in-haystack phrase: zebra lighthouse.`,
        personality: "",
        scenario: "",
        first_mes: "Hello.",
        creator_notes: "",
        summary: "",
        extensions: { fav: i === 0, ...SPECIAL_SOURCES[i] },
        ...(i === 4 ? { source: ["https://example.com/cards/messy-mel", "javascript:alert(1)"] } : {}),
        _tokenPad: 100 * i,
      },
    }),
  );
  return cards;
}

function searchText(row) {
  const d = row.data;
  return [d.name, row.comment, d.creator, d.character_version, d.creator_notes, d.summary, d.description, d.personality, d.scenario, d.first_mes, ...(d.tags ?? [])]
    .filter((v) => typeof v === "string" && v.trim().length > 0)
    .join("\n")
    .normalize("NFKC")
    .toLocaleLowerCase();
}

function tokenEstimate(row) {
  const d = row.data;
  const text = [d.description, d.personality, d.scenario, d.first_mes].join("\n");
  return Math.ceil(text.length / 4) + (d._tokenPad ?? 0);
}

function summaryEntry(row) {
  const d = row.data;
  const summary = [d.summary, d.creator_notes, d.description, d.personality].find((v) => typeof v === "string" && v.trim()) ?? "";
  return {
    id: row.id,
    name: d.name?.trim() || "Unknown",
    comment: row.comment ?? "",
    creator: d.creator ?? "",
    version: d.character_version ?? "",
    tags: d.tags ?? [],
    favorite: d.extensions?.fav === true,
    summary: (summary.trim() || "No creator notes yet.").slice(0, 200),
    tokenEstimate: tokenEstimate(row),
    hasOnboarding: false,
    nameColor: typeof d.extensions?.nameColor === "string" ? d.extensions.nameColor : null,
    avatarPath: row.avatarPath ?? null,
    avatarCrop: null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function fullEntry(row) {
  const d = row.data;
  return {
    ...summaryEntry(row),
    summary: [d.summary, d.creator_notes, d.description, d.personality].find((v) => typeof v === "string" && v.trim()) ?? "",
    explicitSummary: d.summary ?? "",
    description: d.description ?? "",
    personality: d.personality ?? "",
    scenario: d.scenario ?? "",
    firstMessage: d.first_mes ?? "",
    creatorNotes: d.creator_notes ?? "",
  };
}

function sortRows(rows, sort) {
  return [...rows].sort((a, b) => {
    const an = a.data.name, bn = b.data.name;
    if (sort === "favorites") return Number(!!b.data.extensions?.fav) - Number(!!a.data.extensions?.fav) || an.localeCompare(bn) || a.id.localeCompare(b.id);
    if (sort === "name-desc") return bn.localeCompare(an) || a.id.localeCompare(b.id);
    if (sort === "name-asc") return an.localeCompare(bn) || a.id.localeCompare(b.id);
    if (sort === "oldest") return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
    if (sort === "newest") return b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
    return b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id);
  });
}

const foldTag = (tag) => tag.trim().toLowerCase();

/** In-memory mock of Marinara's /api/characters routes used by the extension. */
function buildFolders(rows) {
  const at = "2026-10-01T00:00:00.000Z";
  const pick = (start, step, n) => rows.filter((_, i) => i % step === start).slice(0, n).map((r) => r.id);
  return [
    { id: "folder-favs", name: "Weekend picks", description: "", avatarPath: null, characterIds: pick(3, 41, 40), createdAt: at, updatedAt: at },
    { id: "folder-fantasy", name: "Fantasy crew", description: "", avatarPath: null, characterIds: [...pick(5, 17, 120), "special-0", "deleted-character"], createdAt: at, updatedAt: at },
    { id: "folder-empty", name: "Empty folder", description: "", avatarPath: null, characterIds: [], createdAt: at, updatedAt: at },
  ];
}

export function createMockApi(options) {
  let rows = buildLibrary(options);
  let folders = buildFolders(rows);
  const folderRow = (f) => ({ ...f, characterIds: JSON.stringify(f.characterIds) });
  let generation = 1;
  const stats = { requests: [] };
  const bump = () => {
    generation += 1;
  };

  function catalog(params) {
    const list = (key) => params.getAll(key);
    const view = params.get("view") === "summary";
    let entries = rows;
    const query = normalizeTextForMatch(params.get("search") ?? "");
    if (query) {
      const terms = parseCardTagSearchTerms(query);
      entries = entries.filter((row) => searchText(row).includes(query) || matchesAllCardSearchTags(row.data.tags, terms));
    }
    const fav = params.get("favoriteFilter");
    if (fav === "favorites") entries = entries.filter((r) => r.data.extensions?.fav === true);
    if (fav === "non-favorites") entries = entries.filter((r) => r.data.extensions?.fav !== true);
    const excluded = new Set(list("excludeTag").map(normalizeTextForMatch));
    if (excluded.size) entries = entries.filter((r) => !r.data.tags.some((t) => excluded.has(normalizeTextForMatch(t))));
    const included = new Set(list("tag").map(normalizeTextForMatch));
    if (included.size) entries = entries.filter((r) => r.data.tags.some((t) => included.has(normalizeTextForMatch(t))));
    entries = sortRows(entries, params.get("sort") ?? "");
    const rawLimit = Number(params.get("limit"));
    const rawOffset = Number(params.get("offset"));
    const limit = view ? entries.length : Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(100, Math.trunc(rawLimit)) : 100;
    const offset = view ? 0 : Number.isFinite(rawOffset) && rawOffset > 0 ? Math.trunc(rawOffset) : 0;
    const page = entries.slice(offset, offset + limit + 1);
    return {
      items: page.slice(0, limit).map(view ? summaryEntry : fullEntry),
      limit,
      offset,
      hasMore: page.length > limit,
      catalogGeneration: generation,
      total: entries.length,
      favoriteFolderIds: [],
    };
  }

  function bulkTags(body) {
    const ids = [...new Set((body?.ids ?? []).filter((id) => typeof id === "string" && id.trim()))];
    if (ids.length === 0 || ids.length > 5000) return [400, { error: "Select between 1 and 5,000 characters" }];
    const add = (body.add ?? []).filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim());
    const remove = new Set((body.remove ?? []).filter((t) => typeof t === "string").map(foldTag));
    const rename = (body.rename ?? []).filter((r) => r && typeof r.from === "string" && typeof r.to === "string");
    if (!add.length && !remove.size && !rename.length) return [400, { error: "Provide at least one tag change" }];
    const result = { updatedIds: [], unchangedIds: [], failedIds: [] };
    for (const id of ids) {
      const row = rows.find((r) => r.id === id);
      if (!row) {
        result.failedIds.push(id);
        continue;
      }
      const before = JSON.stringify(row.data.tags);
      let tags = row.data.tags.map((t) => {
        const hit = rename.find((r) => foldTag(r.from) === foldTag(t));
        return hit ? hit.to.trim() : t;
      });
      tags = tags.filter((t) => !remove.has(foldTag(t)));
      for (const t of add) if (!tags.some((x) => foldTag(x) === foldTag(t))) tags.push(t);
      const seen = new Set();
      tags = tags.filter((t) => (seen.has(foldTag(t)) ? false : (seen.add(foldTag(t)), true)));
      if (JSON.stringify(tags) === before) result.unchangedIds.push(id);
      else {
        row.data.tags = tags;
        row.updatedAt = new Date().toISOString();
        result.updatedIds.push(id);
      }
    }
    if (result.updatedIds.length) bump();
    return [200, result];
  }

  function patch(id, body) {
    const row = rows.find((r) => r.id === id);
    if (!row) return [404, { error: "Character not found" }];
    const data = body?.data ?? {};
    // Marinara merges `data` into the stored card (see Phase 4 notes in the plan).
    for (const [key, value] of Object.entries(data)) {
      if (key === "extensions" && value && typeof value === "object") row.data.extensions = { ...row.data.extensions, ...value };
      else row.data[key] = value;
    }
    row.updatedAt = new Date().toISOString();
    bump();
    return [200, rowResponse(row)];
  }

  function rowResponse(row) {
    return { id: row.id, data: JSON.stringify(row.data), comment: row.comment, avatarPath: row.avatarPath, createdAt: row.createdAt, updatedAt: row.updatedAt };
  }

  /**
   * Handle one request. Returns [status, body] or null when the route is unknown.
   * @param {string} method
   * @param {URL} url
   * @param {any} body parsed JSON body
   * @param {Record<string,string>} headers lower-cased header map
   */
  function handle(method, url, body, headers = {}) {
    stats.requests.push(`${method} ${url.pathname}${url.search}`);
    const path = url.pathname;
    if (method !== "GET" && headers["x-marinara-csrf"] !== "1") return [403, { error: "CSRF header missing" }];
    if (method === "GET" && path === "/api/characters/catalog") return [200, catalog(url.searchParams)];
    if (method === "GET" && path === "/api/characters/catalog/tags") {
      return [200, [...new Set(rows.flatMap((r) => r.data.tags))].sort((a, b) => a.localeCompare(b))];
    }
    if (method === "POST" && path === "/api/characters/bulk-tags") return bulkTags(body);
    if (method === "GET" && path === "/api/characters/groups/list") return [200, folders.map(folderRow)];
    if (method === "POST" && path === "/api/characters/groups") {
      if (typeof body?.name !== "string" || !body.name.trim()) return [400, { error: "Name required" }];
      const now = new Date().toISOString();
      const folder = { id: `folder-${Date.now().toString(36)}-${folders.length}`, name: body.name, description: body.description ?? "", avatarPath: null, characterIds: body.characterIds ?? [], createdAt: now, updatedAt: now };
      folders.push(folder);
      return [200, folderRow(folder)];
    }
    const group = path.match(/^\/api\/characters\/groups\/([^/]+)$/);
    if (group) {
      const folder = folders.find((f) => f.id === decodeURIComponent(group[1]));
      if (!folder) return [404, { error: "Group not found" }];
      if (method === "GET") return [200, folderRow(folder)];
      if (method === "PATCH") {
        if (Array.isArray(body?.characterIds)) folder.characterIds = body.characterIds;
        if (typeof body?.name === "string") folder.name = body.name;
        folder.updatedAt = new Date().toISOString();
        return [200, folderRow(folder)];
      }
    }
    const match = path.match(/^\/api\/characters\/([^/]+)$/);
    if (match) {
      const id = decodeURIComponent(match[1]);
      const row = rows.find((r) => r.id === id);
      if (method === "GET") return row ? [200, rowResponse(row)] : [404, { error: "Character not found" }];
      if (method === "PATCH") return patch(id, body);
      if (method === "DELETE") {
        if (!row) return [404, { error: "Character not found" }];
        if (id === "__professor_mari__") return [403, { error: "Professor Mari is a built-in character and cannot be deleted" }];
        rows = rows.filter((r) => r !== row);
        bump();
        return [204, null];
      }
    }
    return null;
  }

  return {
    handle,
    stats,
    get rows() {
      return rows;
    },
    get folders() {
      return folders;
    },
    reset(next = options) {
      rows = buildLibrary(next);
      folders = buildFolders(rows);
      bump();
    },
  };
}

/** Deterministic SVG avatar for a mock id. */
export function avatarSvg(id) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  const letter = id.slice(-2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="384" viewBox="0 0 256 384"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},55%,45%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360},55%,22%)"/></linearGradient></defs><rect width="256" height="384" fill="url(#g)"/><circle cx="128" cy="150" r="62" fill="hsla(0,0%,100%,.25)"/><rect x="48" y="230" width="160" height="120" rx="60" fill="hsla(0,0%,100%,.2)"/><text x="128" y="372" font-family="sans-serif" font-size="28" fill="#fff" text-anchor="middle" opacity=".6">${letter}</text></svg>`;
}
