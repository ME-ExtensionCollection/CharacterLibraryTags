// Character Manager: data layer. Loads the catalog summary, answers full-text
// searches through Marinara's own catalog search, reads single characters and
// writes tag / favorite changes. Shared by the tag filter panel and the manager.
//
// Routes (packages/server/src/routes/characters.routes.ts):
//   GET  /api/characters/catalog?view=summary          every character, metadata only
//   GET  /api/characters/catalog?view=summary&search=x  same, matched on all card text
//   GET  /api/characters/catalog?limit=1                cheap catalogGeneration check
//   GET  /api/characters/:id                            full row, `data` is a JSON string
//   POST /api/characters/bulk-tags                      { ids, add, remove, rename }
//   PATCH /api/characters/:id                           { data: { extensions: { fav } } }
//                                                       (extensions are merged server side)

const CLMData = (() => {
  "use strict";

  const WRITE_HEADERS = { "Content-Type": "application/json", "x-marinara-csrf": "1" };
  const FULL_TEXT_CACHE = 30;
  const BULK_CHUNK = 5000;

  let items = [];
  let generation = null;
  let loaded = false;
  let loading = null;
  const listeners = new Set();
  const fullText = new Map(); // `${generation}\n${term}` -> Promise<Set<id>>

  async function request(path, init) {
    const response = await marinara.fetch(path, init);
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok) {
      const message = body && typeof body.error === "string" ? body.error : `HTTP ${response.status}`;
      throw new Error(`${init?.method ?? "GET"} ${path.split("?")[0]} failed: ${message}`);
    }
    return body;
  }

  function emit() {
    for (const listener of listeners) {
      try {
        listener({ items, generation });
      } catch (error) {
        marinara.log.error("Character catalog listener failed", error);
      }
    }
  }

  /** Load (or reload) every character's summary. Concurrent calls share one request. */
  function load({ force = false } = {}) {
    if (loading) return loading;
    if (loaded && !force) return Promise.resolve({ items, generation });
    loading = (async () => {
      try {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const page = await request("/api/characters/catalog?view=summary");
          if (!Array.isArray(page?.items)) throw new Error("Unexpected catalog response");
          let all = page.items;
          let changed = false;
          if (page.hasMore) {
            // An Engine without view=summary pages; read the rest the slow way.
            all = [...page.items];
            let more = true;
            while (more) {
              const next = await request(`/api/characters/catalog?limit=100&offset=${all.length}`);
              if (next.catalogGeneration !== page.catalogGeneration) {
                changed = true;
                break;
              }
              all.push(...next.items);
              more = next.hasMore && next.items.length > 0;
            }
          }
          if (changed) continue;
          items = all;
          generation = page.catalogGeneration;
          loaded = true;
          emit();
          return { items, generation };
        }
        throw new Error("Character catalog changed repeatedly while loading.");
      } finally {
        loading = null;
      }
    })();
    return loading;
  }

  /** Reload when the library changed since the last load. Returns true when it reloaded. */
  async function revalidate() {
    if (!loaded) {
      await load();
      return true;
    }
    const page = await request("/api/characters/catalog?limit=1");
    if (page?.catalogGeneration === generation) return false;
    await load({ force: true });
    return true;
  }

  /** Ids of characters whose text (description, first message, notes, …) contains `term`. */
  function searchFullText(term) {
    const key = `${generation}\n${term}`;
    let hit = fullText.get(key);
    if (!hit) {
      hit = request(`/api/characters/catalog?view=summary&search=${encodeURIComponent(term)}`).then(
        (page) => new Set(page.items.map((item) => item.id)),
      );
      hit.catch(() => fullText.delete(key));
      fullText.set(key, hit);
      while (fullText.size > FULL_TEXT_CACHE) fullText.delete(fullText.keys().next().value);
    }
    return hit;
  }

  /** Intersect full-text matches for each term (the server matches one phrase per request). */
  async function searchAllTerms(terms) {
    let result = null;
    for (const set of await Promise.all(terms.map(searchFullText))) {
      if (!result) result = new Set(set);
      else for (const id of result) if (!set.has(id)) result.delete(id);
    }
    return result ?? new Set();
  }

  /** Full character: { id, data (parsed object), avatarPath, createdAt, updatedAt, … }. */
  async function getCharacter(id) {
    const row = await request(`/api/characters/${encodeURIComponent(id)}`);
    let data = row?.data;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        data = {};
      }
    }
    return { ...row, data: data && typeof data === "object" ? data : {} };
  }

  function patchLocal(id, patch) {
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) return;
    items = items.slice();
    items[index] = { ...items[index], ...patch };
  }

  /**
   * Add / remove tags on many characters through Marinara's bulk tag endpoint.
   * Updates the local copy so the UI does not need a full reload.
   */
  async function editTags(ids, { add = [], remove = [] }) {
    const result = { updatedIds: [], unchangedIds: [], failedIds: [] };
    for (let i = 0; i < ids.length; i += BULK_CHUNK) {
      const chunk = ids.slice(i, i + BULK_CHUNK);
      const part = await request("/api/characters/bulk-tags", {
        method: "POST",
        headers: WRITE_HEADERS,
        body: JSON.stringify({ ids: chunk, add, remove, rename: [] }),
      });
      result.updatedIds.push(...(part.updatedIds ?? []));
      result.unchangedIds.push(...(part.unchangedIds ?? []));
      result.failedIds.push(...(part.failedIds ?? []));
    }
    // Mirror the server's edit locally (case-insensitive, trimmed, like foldTag).
    const fold = (tag) => tag.trim().toLowerCase();
    const removeSet = new Set(remove.map(fold));
    const updated = new Set(result.updatedIds);
    items = items.map((item) => {
      if (!updated.has(item.id)) return item;
      const tags = (item.tags ?? []).filter((tag) => !removeSet.has(fold(tag)));
      for (const tag of add) if (!tags.some((t) => fold(t) === fold(tag))) tags.push(tag.trim());
      return { ...item, tags, updatedAt: new Date().toISOString() };
    });
    if (updated.size) await syncGeneration();
    emit();
    return result;
  }

  async function setFavorite(id, favorite) {
    await request(`/api/characters/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: WRITE_HEADERS,
      body: JSON.stringify({ data: { extensions: { fav: favorite } }, skipVersionSnapshot: true }),
    });
    patchLocal(id, { favorite });
    await syncGeneration();
    emit();
  }

  /** After our own write, adopt the new generation so revalidate() does not reload everything. */
  async function syncGeneration() {
    try {
      const page = await request("/api/characters/catalog?limit=1");
      generation = page.catalogGeneration;
    } catch {
      generation = null;
    }
  }

  // ── Tag Merger (optional, read-only API on window.marinaraTagMerger) ──

  function tagMerger() {
    const api = window.marinaraTagMerger;
    if (!api || typeof api.mapTags !== "function") return { available: false, reason: "Tag Merger is not running." };
    if (typeof api.canonicalTags !== "function") {
      return { available: false, reason: "Update Tag Merger to use its canonical tags here." };
    }
    return { available: true, api };
  }

  /**
   * For "fold variants": raw tag key -> effective labels (canonical + implications,
   * or the tag itself when Tag Merger does not know it).
   */
  async function tagExpansion(normalizeTag) {
    const { available, api } = tagMerger();
    if (!available) return null;
    const labels = new Map();
    for (const item of items) for (const tag of item.tags ?? []) {
      const key = normalizeTag(tag);
      if (key && !labels.has(key)) labels.set(key, tag);
    }
    const keys = [...labels.keys()];
    const inputs = keys.map((key) => [labels.get(key)]);
    const mapped =
      typeof api.mapTagsBatch === "function"
        ? await api.mapTagsBatch(inputs)
        : await Promise.all(inputs.map((tags) => api.mapTags(tags)));
    const expand = new Map();
    keys.forEach((key, i) => {
      // Keep the library's own spelling for tags no canonical claims
      // (mapTags would also tidy those, e.g. drop emoji).
      const { canonical = [] } = mapped[i] ?? {};
      expand.set(key, canonical.length ? canonical : [labels.get(key)]);
    });
    return expand;
  }

  async function canonicalKeys(normalizeTag) {
    const { available, api } = tagMerger();
    if (!available) return null;
    return new Set((await api.canonicalTags()).map(normalizeTag).filter(Boolean));
  }

  return Object.freeze({
    load,
    revalidate,
    searchAllTerms,
    getCharacter,
    editTags,
    setFavorite,
    tagMerger,
    tagExpansion,
    canonicalKeys,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get items() {
      return items;
    },
    get loaded() {
      return loaded;
    },
    get generation() {
      return generation;
    },
  });
})();
