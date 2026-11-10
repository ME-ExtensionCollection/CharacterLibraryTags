// Character Manager: pure search, sort and tag logic. No DOM and no Marinara
// globals, so test/core.test.mjs can load this file on its own in a Node vm.
//
// Data comes from GET /api/characters/catalog?view=summary (every character,
// metadata only). Everything here works on an index built once per catalog
// generation, so each keystroke is one linear pass over precomputed fields.

const CLM = (() => {
  "use strict";

  // Mirrors normalizeTextForMatch in packages/shared/src/utils/text-matching.ts.
  const normalizeTag = (value) =>
    typeof value === "string" ? value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/gu, " ") : "";

  const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

  const SCOPES = Object.freeze(["any", "name", "creator", "tags", "all"]);

  const SORTS = Object.freeze({
    "name-asc": "Name A-Z",
    "name-desc": "Name Z-A",
    "tags-desc": "Most tags",
    "tags-asc": "Least tags",
    "created-desc": "Newest",
    "created-asc": "Oldest",
    "updated-desc": "Recently updated",
    "updated-asc": "Least recently updated",
    "tokens-desc": "Most tokens",
    "tokens-asc": "Least tokens",
    "creator-asc": "Creator A-Z",
    favorites: "Favorites first",
    random: "Random",
  });

  function emptyQuery() {
    return {
      text: "",
      scope: "any",
      mandatory: [], // tag keys, all required
      anyOf: [], // tag keys, at least one required
      excluded: [], // tag keys, none allowed
      favoritesOnly: false,
      untaggedOnly: false,
      tagCount: { min: null, max: null },
      tokens: { min: null, max: null },
      created: { from: null, to: null }, // ms timestamps
      folder: null, // null = any, "none" = in no folder, "some" = in a folder, or a folder id
    };
  }

  const toMs = (value) => {
    const ms = Date.parse(value ?? "");
    return Number.isFinite(ms) ? ms : 0;
  };

  /**
   * Build the search index.
   * @param {Array<object>} items catalog summary entries
   * @param {{expand?: Map<string, string[]>}} [options]
   *   expand: raw tag key -> effective tag labels (Tag Merger "fold variants"):
   *   a card's effective tags are the union of its tags' expansions.
   * @param {Array<{id: string, name: string, characterIds: string[]}>} [options.folders]
   *   Marinara's character folders (character groups); a character can be in several.
   */
  function buildIndex(items, options = {}) {
    const expand = options.expand ?? null;
    const folders = Array.isArray(options.folders) ? options.folders : [];
    const folderOf = new Map(); // character id -> folder ids
    for (const folder of folders) {
      for (const id of folder.characterIds ?? []) {
        const list = folderOf.get(id);
        if (list) {
          if (!list.includes(folder.id)) list.push(folder.id);
        } else folderOf.set(id, [folder.id]);
      }
    }
    const folderById = new Map(folders.map((f) => [f.id, { ...f, nameKey: normalizeTag(f.name ?? "") }]));
    const labelUses = new Map(); // key -> Map(label -> uses)
    const cards = [];
    const byId = new Map();
    for (const item of items) {
      const keys = [];
      const seen = new Set();
      const rawTags = Array.isArray(item.tags) ? item.tags : [];
      for (const raw of rawTags) {
        if (typeof raw !== "string") continue;
        const rawKey = normalizeTag(raw);
        if (!rawKey) continue;
        const labels = expand?.get(rawKey) ?? [raw.trim()];
        for (const label of labels) {
          const key = normalizeTag(label);
          if (!key || seen.has(key)) continue;
          seen.add(key);
          keys.push(key);
          const uses = labelUses.get(key) ?? new Map();
          uses.set(label.trim(), (uses.get(label.trim()) ?? 0) + 1);
          labelUses.set(key, uses);
        }
      }
      const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : "Unknown";
      const creator = typeof item.creator === "string" ? item.creator.trim() : "";
      const card = {
        id: item.id,
        item,
        name,
        nameKey: normalizeTag(name),
        creator,
        creatorKey: normalizeTag(creator),
        tagKeys: seen,
        tagList: keys,
        tagText: keys.join("\n"),
        tagCount: keys.length,
        rawTagCount: rawTags.length,
        favorite: item.favorite === true,
        created: toMs(item.createdAt),
        updated: toMs(item.updatedAt),
        tokens: Number.isFinite(item.tokenEstimate) ? item.tokenEstimate : 0,
        folderIds: folderOf.get(item.id) ?? [],
        folderText: (folderOf.get(item.id) ?? []).map((id) => folderById.get(id)?.nameKey ?? "").join("\n"),
      };
      cards.push(card);
      byId.set(card.id, card);
    }
    const tags = new Map();
    for (const [key, uses] of labelUses) {
      let label = key;
      let best = 0;
      let count = 0;
      for (const [candidate, n] of uses) {
        count += n;
        if (n > best || (n === best && candidate < label)) {
          best = n;
          label = candidate;
        }
      }
      tags.set(key, { key, label, count });
    }
    // Member counts only for characters that exist (folders can hold deleted ids).
    const folderList = [...folderById.values()].map((f) => ({
      ...f,
      count: (f.characterIds ?? []).filter((id) => byId.has(id)).length,
    }));
    folderList.sort((a, b) => collator.compare(a.name ?? "", b.name ?? ""));
    return { cards, byId, tags, folders: folderList, folderById: new Map(folderList.map((f) => [f.id, f])) };
  }

  // ── Search box syntax ──
  //
  //   word            substring of the scope field(s); all words must match
  //   "two words"     phrase, same as a word
  //   -word           the scope field(s) must not contain it
  //   #tag  tag:x     mandatory tag            #"two words"  tag:"two words"
  //   -#tag -tag:x    excluded tag
  //   ~tag  any:x     at least one of these tags
  //   creator:x       creator contains x       creator:"two words"
  //   folder:x        in a folder whose name contains x            -folder:x  not in one
  //
  // Tag tokens become chips in the UI (takeTagTokens); the rest stays as text.

  const TOKEN = /(-|!)?(#|~|tag:|any:|creator:|folder:)?(?:"([^"]*)"?|(\S+))/giu;

  /** @returns {Array<{kind: string, value: string, start: number, end: number, closed: boolean}>} */
  function tokenize(text) {
    const out = [];
    for (const m of String(text).matchAll(TOKEN)) {
      const [whole, neg, prefixRaw, quoted, bare] = m;
      const prefix = (prefixRaw ?? "").toLowerCase();
      const value = (quoted ?? bare ?? "").trim();
      const closed = quoted !== undefined ? /"$/u.test(whole) && whole.length > 1 + (neg ? 1 : 0) + prefix.length : true;
      let kind;
      if (prefix === "#" || prefix === "tag:") kind = neg ? "excluded" : "mandatory";
      else if (prefix === "~" || prefix === "any:") kind = neg ? "excluded" : "anyOf";
      else if (prefix === "creator:") kind = neg ? "notCreator" : "creator";
      else if (prefix === "folder:") kind = neg ? "notFolder" : "folder";
      else kind = neg ? "notText" : "text";
      // A lone "-", "#" or "~" is a token still being typed.
      if ((kind === "text" || kind === "notText") && /^[-!#~"]*$/u.test(value)) continue;
      out.push({ kind, value, start: m.index, end: m.index + whole.length, closed });
    }
    return out;
  }

  /**
   * Split the search text into text terms and structured filters.
   * Tag tokens are kept here too, so a query typed by hand still filters before
   * the UI turns them into chips.
   */
  function parseSearch(text) {
    const parsed = { words: [], notWords: [], mandatory: [], anyOf: [], excluded: [], creators: [], notCreators: [], folders: [], notFolders: [] };
    for (const token of tokenize(text)) {
      const key = normalizeTag(token.value);
      if (!key) continue;
      if (token.kind === "text") parsed.words.push(key);
      else if (token.kind === "notText") parsed.notWords.push(key);
      else if (token.kind === "creator") parsed.creators.push(key);
      else if (token.kind === "notCreator") parsed.notCreators.push(key);
      else if (token.kind === "folder") parsed.folders.push(key);
      else if (token.kind === "notFolder") parsed.notFolders.push(key);
      else parsed[token.kind].push(key);
    }
    return parsed;
  }

  /**
   * Pull finished tag tokens out of the search text so the UI can show them as chips.
   * A token is finished when whitespace follows it, or always when `final` (Enter).
   * @returns {{chips: Array<{kind: "mandatory"|"anyOf"|"excluded", label: string}>, rest: string}}
   */
  function takeTagTokens(text, final = false) {
    const chips = [];
    let rest = "";
    let last = 0;
    for (const token of tokenize(text)) {
      if (token.kind !== "mandatory" && token.kind !== "anyOf" && token.kind !== "excluded") continue;
      const finished = token.value && token.closed && (final || /\s/u.test(text[token.end] ?? ""));
      if (!finished) continue;
      chips.push({ kind: token.kind, label: token.value });
      rest += text.slice(last, token.start);
      last = token.end;
    }
    rest += text.slice(last);
    return { chips, rest: rest.replace(/\s{2,}/gu, " ").replace(/^\s+/u, "") };
  }

  /** Quote a label for the search syntax when needed. */
  const quoteToken = (prefix, label) => (/[\s"]/u.test(label) ? `${prefix}"${label.replace(/"/gu, "")}"` : `${prefix}${label}`);

  // ── Filtering ──

  const inRange = (value, range) =>
    (range?.min === null || range?.min === undefined || value >= range.min) &&
    (range?.max === null || range?.max === undefined || value <= range.max);

  function haystackFor(card, scope) {
    switch (scope) {
      case "name":
        return card.nameKey;
      case "creator":
        return card.creatorKey;
      case "tags":
        return card.tagText;
      default:
        return `${card.nameKey}\n${card.creatorKey}\n${card.tagText}`;
    }
  }

  /**
   * Compile a query into a predicate over index cards.
   * @param {object} query see emptyQuery()
   * @param {{serverIds?: Set<string>|null}} [extra]
   *   serverIds: ids matched by the server's full-text search, for scope "all".
   *   null while that request is pending: then the text matches locally ("any").
   */
  function compile(query, extra = {}) {
    const parsed = parseSearch(query.text ?? "");
    const mandatory = [...new Set([...(query.mandatory ?? []), ...parsed.mandatory])];
    const anyOf = [...new Set([...(query.anyOf ?? []), ...parsed.anyOf])];
    const excluded = [...new Set([...(query.excluded ?? []), ...parsed.excluded])];
    const scope = SCOPES.includes(query.scope) ? query.scope : "any";
    const serverIds = scope === "all" ? (extra.serverIds ?? null) : null;
    const localScope = scope === "all" ? "any" : scope;
    const words = parsed.words;
    const notWords = parsed.notWords;
    const useServer = serverIds !== null && words.length > 0;
    const { creators, notCreators, folders, notFolders } = parsed;
    const folder = query.folder ?? null;
    const created = query.created ?? {};
    const createdRange = { min: created.from ?? null, max: created.to ?? null };

    return (card) => {
      if (query.favoritesOnly && !card.favorite) return false;
      if (query.untaggedOnly && card.tagCount > 0) return false;
      for (const key of mandatory) if (!card.tagKeys.has(key)) return false;
      for (const key of excluded) if (card.tagKeys.has(key)) return false;
      if (anyOf.length) {
        let hit = false;
        for (const key of anyOf)
          if (card.tagKeys.has(key)) {
            hit = true;
            break;
          }
        if (!hit) return false;
      }
      if (!inRange(card.tagCount, query.tagCount)) return false;
      if (!inRange(card.tokens, query.tokens)) return false;
      if (!inRange(card.created, createdRange)) return false;
      for (const c of creators) if (!card.creatorKey.includes(c)) return false;
      for (const c of notCreators) if (card.creatorKey.includes(c)) return false;
      if (folder === "none") {
        if (card.folderIds.length) return false;
      } else if (folder === "some") {
        if (!card.folderIds.length) return false;
      } else if (folder !== null && !card.folderIds.includes(folder)) return false;
      for (const f of folders) if (!card.folderText.includes(f)) return false;
      for (const f of notFolders) if (card.folderText.includes(f)) return false;
      if (useServer) {
        if (!serverIds.has(card.id)) return false;
      } else if (words.length) {
        const hay = haystackFor(card, localScope);
        for (const w of words) if (!hay.includes(w)) return false;
      }
      if (notWords.length) {
        const hay = haystackFor(card, localScope);
        for (const w of notWords) if (hay.includes(w)) return false;
      }
      return true;
    };
  }

  /** Words the server must match for scope "all" (each is one request; results intersect). */
  const serverTerms = (query) => (query.scope === "all" ? [...new Set(parseSearch(query.text ?? "").words)] : []);

  function filter(index, query, extra) {
    const predicate = compile(query, extra);
    const out = [];
    for (const card of index.cards) if (predicate(card)) out.push(card);
    return out;
  }

  // ── Sorting ──

  function hash(text, seed) {
    let h = (2166136261 ^ seed) >>> 0;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  }

  const byName = (a, b) => collator.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  function sortCards(cards, sort, seed = 1) {
    const list = [...cards];
    switch (sort) {
      case "name-desc":
        return list.sort((a, b) => byName(b, a));
      case "tags-desc":
        return list.sort((a, b) => b.tagCount - a.tagCount || byName(a, b));
      case "tags-asc":
        return list.sort((a, b) => a.tagCount - b.tagCount || byName(a, b));
      case "created-desc":
        return list.sort((a, b) => b.created - a.created || byName(a, b));
      case "created-asc":
        return list.sort((a, b) => a.created - b.created || byName(a, b));
      case "updated-desc":
        return list.sort((a, b) => b.updated - a.updated || byName(a, b));
      case "updated-asc":
        return list.sort((a, b) => a.updated - b.updated || byName(a, b));
      case "tokens-desc":
        return list.sort((a, b) => b.tokens - a.tokens || byName(a, b));
      case "tokens-asc":
        return list.sort((a, b) => a.tokens - b.tokens || byName(a, b));
      case "creator-asc":
        // Cards without a creator go last.
        return list.sort(
          (a, b) => (!a.creator - !b.creator) || collator.compare(a.creator, b.creator) || byName(a, b),
        );
      case "favorites":
        return list.sort((a, b) => b.favorite - a.favorite || byName(a, b));
      case "random": {
        const keyed = list.map((card) => [hash(card.id, seed), card]);
        keyed.sort((a, b) => a[0] - b[0] || (a[1].id < b[1].id ? -1 : 1));
        return keyed.map(([, card]) => card);
      }
      default:
        return list.sort(byName);
    }
  }

  // ── Tags ──

  /** Tag key -> number of cards in `cards` that carry it. */
  function facetCounts(cards) {
    const counts = new Map();
    for (const card of cards) for (const key of card.tagList) counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }

  /**
   * Tag suggestions for an autocomplete field.
   * @param {Map} tags index.tags
   * @param {string} text typed text
   * @param {{facets?: Map, taken?: Set, visible?: (key) => boolean, limit?: number}} options
   */
  function suggestTags(tags, text, { facets = null, taken = new Set(), visible = null, limit = 10 } = {}) {
    const query = normalizeTag(String(text).replace(/^[-!~#]+/u, ""));
    const ranked = [];
    for (const info of tags.values()) {
      if (taken.has(info.key)) continue;
      if (visible && !visible(info.key)) continue;
      const at = query ? info.key.indexOf(query) : 0;
      if (at < 0) continue;
      const rank = query && info.key === query ? 0 : at === 0 ? 1 : 2;
      ranked.push({ ...info, rank, matching: facets ? (facets.get(info.key) ?? 0) : info.count });
    }
    ranked.sort(
      (a, b) =>
        a.rank - b.rank ||
        (b.matching > 0) - (a.matching > 0) ||
        b.matching - a.matching ||
        b.count - a.count ||
        collator.compare(a.label, b.label),
    );
    return ranked.slice(0, limit);
  }

  /** Top tags in the current results, for the tag cloud. */
  function topTags(tags, facets, { limit = 60, exclude = new Set(), visible = null } = {}) {
    const list = [];
    for (const [key, n] of facets) {
      if (exclude.has(key) || (visible && !visible(key))) continue;
      list.push({ key, label: tags.get(key)?.label ?? key, matching: n, count: tags.get(key)?.count ?? n });
    }
    list.sort((a, b) => b.matching - a.matching || collator.compare(a.label, b.label));
    return list.slice(0, limit);
  }

  /** Number of active filters, for badges. */
  function activeFilterCount(query) {
    const parsed = parseSearch(query.text ?? "");
    return (
      query.mandatory.length +
      query.anyOf.length +
      query.excluded.length +
      parsed.words.length +
      parsed.notWords.length +
      parsed.creators.length +
      parsed.notCreators.length +
      parsed.folders.length +
      parsed.notFolders.length +
      Number(query.folder !== null && query.folder !== undefined) +
      Number(!!query.favoritesOnly) +
      Number(!!query.untaggedOnly) +
      Number(query.tagCount.min !== null || query.tagCount.max !== null) +
      Number(query.tokens.min !== null || query.tokens.max !== null) +
      Number(query.created.from !== null || query.created.to !== null)
    );
  }

  // ── Where a card came from ──

  // Marinara's Bot Browser saves `extensions.botBrowserSource = "<site>:<id>"` (and
  // `extensions[site].id`); the page addresses match BotBrowserView.tsx. Cards
  // downloaded from Chub elsewhere carry `extensions.chub.full_path`, and V3 cards
  // may list addresses in `source`.
  const SOURCE_SITES = {
    chub: { label: "Chub", url: (id) => `https://chub.ai/characters/${encodeURI(id)}` },
    janny: {
      label: "JannyAI",
      url: (id, name) => `https://jannyai.com/characters/${encodeURIComponent(id)}_character-${String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    },
    pygmalion: { label: "Pygmalion", url: (id) => `https://pygmalion.chat/character/${encodeURIComponent(id)}` },
    wyvern: { label: "Wyvern", url: (id) => `https://app.wyvern.chat/characters/${encodeURIComponent(id)}` },
    datacat: { label: "DataCat", url: (id) => `https://datacat.run/characters/${encodeURIComponent(id)}` },
  };

  const webUrl = (value) => {
    if (typeof value !== "string") return null;
    try {
      const url = new URL(value.trim());
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
    } catch {
      return null;
    }
  };

  /** Friendly site name for a link's host. */
  const HOST_LABELS = [
    [/(^|\.)(chub\.ai|characterhub\.org)$/, "Chub"],
    [/(^|\.)botbooru\.com$/, "Botbooru"],
    [/(^|\.)(jannyai\.com|janitorai\.com)$/, "JannyAI"],
    [/(^|\.)pygmalion\.chat$/, "Pygmalion"],
    [/(^|\.)wyvern\.chat$/, "Wyvern"],
    [/(^|\.)datacat\.run$/, "DataCat"],
    [/(^|\.)realm\.risuai\.net$/, "RisuRealm"],
  ];
  const hostLabel = (url) => {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return HOST_LABELS.find(([re]) => re.test(host))?.[1] ?? host;
  };

  /** Botbooru download / post addresses point at the character page instead. */
  const tidyUrl = (url) => {
    const u = new URL(url);
    if (u.hostname.replace(/^www\./, "") === "botbooru.com") {
      const parts = u.pathname.split("/").filter(Boolean);
      const id = parts[0] === "post" ? parts[1] : parts[0] === "download" ? parts[2] : null;
      if (/^\d+$/.test(id ?? "")) return `https://botbooru.com/character/${id}`;
    }
    return u.href;
  };
  const sameUrl = (url) => url.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");

  /**
   * Links to the page(s) a character was downloaded from, from its full card data
   * (the `data` object of GET /api/characters/:id). Returns [{ label, url }] with
   * only http(s) addresses, most specific first, without duplicates. Reads
   * Char Importer's `extensions.char_importer.source_url`, Botbooru's
   * `extensions.botbooru.post_id`, Marinara's Bot Browser marker, Chub's
   * `extensions.chub.full_path`, `extensions.source_url` and V3 `source`.
   */
  function sourceLinks(data) {
    const out = [];
    const add = (url, label = null) => {
      const safe = webUrl(url);
      if (!safe) return;
      const tidy = tidyUrl(safe);
      if (!out.some((l) => sameUrl(l.url) === sameUrl(tidy))) out.push({ label: label ?? hostLabel(tidy), url: tidy });
    };
    const ext = data && typeof data.extensions === "object" && data.extensions ? data.extensions : {};
    const fromSite = (site, id) => {
      const known = SOURCE_SITES[site];
      if (known && typeof id === "string" && id.trim()) add(known.url(id.trim(), data.name), known.label);
    };
    add(ext.char_importer?.source_url);
    const booru = String(ext.botbooru?.post_id ?? "");
    if (/^\d+$/.test(booru)) add(`https://botbooru.com/character/${booru}`);
    if (typeof ext.botBrowserSource === "string") {
      const at = ext.botBrowserSource.indexOf(":");
      if (at > 0) fromSite(ext.botBrowserSource.slice(0, at), ext.botBrowserSource.slice(at + 1));
    }
    for (const site of Object.keys(SOURCE_SITES)) {
      const id = ext[site]?.id;
      if (typeof id === "string" || typeof id === "number") fromSite(site, String(id));
    }
    const chubPath = ext.chub?.full_path ?? ext.chub?.fullPath;
    if (typeof chubPath === "string" && chubPath.includes("/")) fromSite("chub", chubPath);
    add(ext.source_url);
    const sources = Array.isArray(data?.source) ? data.source : [data?.source];
    for (const value of sources) add(value);
    return out;
  }

  return Object.freeze({
    normalizeTag,
    sourceLinks,
    SCOPES,
    SORTS,
    emptyQuery,
    buildIndex,
    tokenize,
    parseSearch,
    takeTagTokens,
    quoteToken,
    compile,
    serverTerms,
    filter,
    sortCards,
    facetCounts,
    suggestTags,
    topTags,
    activeFilterCount,
  });
})();
