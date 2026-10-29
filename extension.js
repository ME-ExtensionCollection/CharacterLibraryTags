// Character Library Tag Filter
//
// Full-page External Extension for Marinara Engine. Adds a tag button to the
// full Character Library that expands "At least one tag" and "Excluded tags"
// fields with autocomplete.
//
// - Included tags (any-of) hide non-matching cards through an injected
//   stylesheet, so React-owned nodes are never modified.
// - Excluded tags live in the library search box as `-tag:"X"` tokens, which
//   Marinara already understands. The search box is the source of truth.

const ROOT_SELECTOR = '[data-component="CharacterLibraryView"]';
const CHARACTER_KIND_SELECTOR = ".mari-panel-gradient--characters";
const CARD_ATTRIBUTE = "data-card-library-card";
const CATALOG_PAGE_SIZE = 100;
const MAX_SUGGESTIONS = 10;
const UNKNOWN_CARD_REFRESH_DELAY = 500;
// Mirrors parseCardLibrarySearchQuery in packages/client/src/lib/card-library-search.ts.
const EXCLUDE_TOKEN = /(?:^|\s)(?:-|!)(?:tag:|#)?(?:"([^"]+)"|(\S+))/gi;
const SVG_NS = "http://www.w3.org/2000/svg";
const nativeValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;

// Mirrors normalizeTextForMatch in packages/shared/src/utils/text-matching.ts.
const normalizeTag = (value) =>
  typeof value === "string" ? value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/gu, " ") : "";

const catalog = {
  idToTags: new Map(), // character id -> Set of normalized tags
  tagInfo: new Map(), // normalized tag -> { key, label, count }
  loaded: false,
  loading: null,
  reloadQueued: false,
  requestedIds: new Set(), // unknown card ids that already triggered a refresh
};

// Reset whenever the library mounts, matching Marinara's own search box.
const includedTags = new Map(); // normalized tag -> label
let view = null;
let frame = 0;
let unknownCardTimer = 0;
let stopped = false;

const styleElement = document.createElement("style");
styleElement.id = "clt-include-style";
document.head.append(styleElement);

// ── DOM helpers ──

function el(tag, { className, text, attrs } = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  for (const [name, value] of Object.entries(attrs ?? {})) node.setAttribute(name, value);
  return node;
}

function createTagIcon() {
  const svg = document.createElementNS(SVG_NS, "svg");
  for (const [name, value] of Object.entries({
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    class: "clt-toggle-icon",
  })) {
    svg.setAttribute(name, value);
  }
  for (const d of [
    "m15 5 6.3 6.3a2.4 2.4 0 0 1 0 3.4L17 19",
    "M9.586 5.586A2 2 0 0 0 8.172 5H3a1 1 0 0 0-1 1v5.172a2 2 0 0 0 .586 1.414L8.29 18.29a2.426 2.426 0 0 0 3.42 0l3.58-3.58a2.426 2.426 0 0 0 0-3.42z",
  ]) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  const dot = document.createElementNS(SVG_NS, "circle");
  for (const [name, value] of Object.entries({ cx: "6.5", cy: "9.5", r: ".5", fill: "currentColor" })) {
    dot.setAttribute(name, value);
  }
  svg.append(dot);
  return svg;
}

// ── Catalog ──

async function fetchCatalog() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const idToTags = new Map();
    const labelCounts = new Map();
    let generation = null;
    let offset = 0;
    let changed = false;
    for (;;) {
      const response = await marinara.fetch(`/api/characters/catalog?limit=${CATALOG_PAGE_SIZE}&offset=${offset}`);
      if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);
      const page = await response.json();
      generation ??= page.catalogGeneration;
      if (page.catalogGeneration !== generation) {
        changed = true;
        break;
      }
      for (const item of page.items) {
        const tags = new Set();
        for (const raw of Array.isArray(item.tags) ? item.tags : []) {
          const key = normalizeTag(raw);
          if (!key || tags.has(key)) continue;
          tags.add(key);
          const label = raw.trim();
          const labels = labelCounts.get(key) ?? new Map();
          labels.set(label, (labels.get(label) ?? 0) + 1);
          labelCounts.set(key, labels);
        }
        idToTags.set(item.id, tags);
      }
      if (!page.hasMore || page.items.length === 0) break;
      offset += page.items.length;
    }
    if (changed) continue;

    const tagInfo = new Map();
    for (const [key, labels] of labelCounts) {
      let label = key;
      let best = 0;
      let count = 0;
      for (const [candidate, uses] of labels) {
        count += uses;
        if (uses > best) {
          best = uses;
          label = candidate;
        }
      }
      tagInfo.set(key, { key, label, count });
    }
    return { idToTags, tagInfo };
  }
  throw new Error("Character catalog changed repeatedly while loading.");
}

function refreshCatalog() {
  if (catalog.loading) {
    catalog.reloadQueued = true;
    return catalog.loading;
  }
  catalog.loading = (async () => {
    try {
      const result = await fetchCatalog();
      catalog.idToTags = result.idToTags;
      catalog.tagInfo = result.tagInfo;
      catalog.loaded = true;
    } catch (error) {
      marinara.log.warn("Could not load the character catalog", error);
    } finally {
      catalog.loading = null;
    }
    if (stopped) return;
    if (catalog.reloadQueued) {
      catalog.reloadQueued = false;
      await refreshCatalog();
      return;
    }
    renderFilters();
  })();
  return catalog.loading;
}

function scheduleCatalogRefresh() {
  marinara.clearTimeout(unknownCardTimer);
  unknownCardTimer = marinara.setTimeout(() => void refreshCatalog(), UNKNOWN_CARD_REFRESH_DELAY);
}

const labelFor = (key, fallback) => catalog.tagInfo.get(key)?.label ?? fallback;

// ── Include (any-of) ──

function matchesIncluded(tags) {
  if (!tags) return false;
  for (const key of includedTags.keys()) if (tags.has(key)) return true;
  return false;
}

function renderIncludeStyle() {
  let css = "";
  if (view && includedTags.size > 0) {
    const selectors = [];
    for (const [id, tags] of catalog.idToTags) {
      if (matchesIncluded(tags)) continue;
      const card = `${ROOT_SELECTOR} [${CARD_ATTRIBUTE}="${CSS.escape(id)}"]`;
      // The sibling is the inline detail Marinara shows under a selected card on small screens.
      selectors.push(card, `${card} + .col-span-full`);
    }
    if (selectors.length) css = `${selectors.join(",\n")} {\n  display: none !important;\n}\n`;
  }
  if (styleElement.textContent !== css) styleElement.textContent = css;
}

function addIncludedTag(label) {
  includedTags.set(normalizeTag(label), label);
  renderFilters();
}

function removeIncludedTag(key) {
  includedTags.delete(key);
  renderFilters();
}

// ── Exclude (search box `-tag:` tokens) ──

function readExcludedTags() {
  const tags = new Map();
  for (const match of (view?.searchInput.value ?? "").matchAll(EXCLUDE_TOKEN)) {
    const raw = (match[1] ?? match[2] ?? "").trim();
    const key = normalizeTag(raw);
    if (key && !tags.has(key)) tags.set(key, labelFor(key, raw));
  }
  return tags;
}

function writeSearch(value) {
  // The search box is a controlled React input: set through the native setter
  // and dispatch `input` so React's onChange sees the new value.
  nativeValueSetter.call(view.searchInput, value);
  view.searchInput.dispatchEvent(new Event("input", { bubbles: true }));
}

const canExclude = (label) => !label.includes('"');

function addExcludedTag(label) {
  if (!canExclude(label) || readExcludedTags().has(normalizeTag(label))) return;
  const current = view.searchInput.value.trimEnd();
  writeSearch(`${current ? `${current} ` : ""}-tag:"${label}"`);
}

function removeExcludedTag(key) {
  const next = view.searchInput.value
    .replace(EXCLUDE_TOKEN, (match, quoted, bare) => (normalizeTag((quoted ?? bare ?? "").trim()) === key ? " " : match))
    .replace(/\s{2,}/gu, " ")
    .trim();
  writeSearch(next);
}

// ── Tag field widget ──

function createTagField({ id, label, chipClass, readTags, addTag, removeTag, canAdd, disabledReason }) {
  const labelElement = el("label", { className: "clt-label", text: label, attrs: { for: `${id}-input` } });
  const box = el("div", { className: "mari-chrome-field clt-field" });
  const input = el("input", {
    className: "clt-input",
    attrs: {
      id: `${id}-input`,
      type: "text",
      autocomplete: "off",
      spellcheck: "false",
      role: "combobox",
      "aria-autocomplete": "list",
      "aria-expanded": "false",
      "aria-controls": `${id}-list`,
    },
  });
  const list = el("ul", { className: "clt-suggestions", attrs: { id: `${id}-list`, role: "listbox", hidden: "" } });
  box.append(input, list);

  let suggestions = [];
  let active = -1;

  function computeSuggestions() {
    const query = normalizeTag(input.value);
    const taken = readTags();
    const ranked = [];
    for (const info of catalog.tagInfo.values()) {
      if (taken.has(info.key)) continue;
      const at = query ? info.key.indexOf(query) : 0;
      if (at < 0) continue;
      ranked.push({ info, rank: query && info.key === query ? 0 : at === 0 ? 1 : 2 });
    }
    ranked.sort(
      (left, right) =>
        left.rank - right.rank || right.info.count - left.info.count || left.info.label.localeCompare(right.info.label),
    );
    return ranked.slice(0, MAX_SUGGESTIONS).map(({ info }) => ({ ...info, disabled: !canAdd(info.label) }));
  }

  function renderSuggestions() {
    const open = document.activeElement === input && suggestions.length > 0;
    list.replaceChildren(
      ...suggestions.map((suggestion, index) => {
        const item = el("li", {
          className: "clt-suggestion",
          attrs: {
            id: `${id}-option-${index}`,
            role: "option",
            "aria-selected": String(index === active),
            ...(suggestion.disabled ? { "aria-disabled": "true", title: disabledReason } : {}),
          },
        });
        item.append(
          el("span", { className: "clt-suggestion-label", text: suggestion.label }),
          el("span", { className: "clt-suggestion-count", text: String(suggestion.count) }),
        );
        item.addEventListener("click", () => commit(suggestion.label));
        return item;
      }),
    );
    list.hidden = !open;
    input.setAttribute("aria-expanded", String(open));
    if (open && active >= 0) {
      input.setAttribute("aria-activedescendant", `${id}-option-${active}`);
      list.children[active]?.scrollIntoView({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function refreshSuggestions() {
    suggestions = computeSuggestions();
    active = suggestions.findIndex((suggestion) => !suggestion.disabled);
    renderSuggestions();
  }

  function moveActive(step) {
    if (!suggestions.length) return;
    let next = active;
    for (let tries = 0; tries < suggestions.length; tries += 1) {
      next = (next + step + suggestions.length) % suggestions.length;
      if (!suggestions[next].disabled) break;
    }
    active = next;
    renderSuggestions();
  }

  function commit(text) {
    const typed = text.trim();
    const value = labelFor(normalizeTag(typed), typed);
    if (!value || !canAdd(value)) return;
    addTag(value);
    input.value = "";
    refreshSuggestions();
  }

  function renderChips() {
    for (const chip of box.querySelectorAll(".clt-chip")) chip.remove();
    const fragment = document.createDocumentFragment();
    for (const [key, text] of readTags()) {
      const chip = el("span", { className: `mari-chrome-control mari-chrome-control--compact clt-chip ${chipClass}` });
      const remove = el("button", {
        className: "clt-chip-remove",
        text: "×",
        attrs: { type: "button", "aria-label": `Remove ${text}`, title: `Remove ${text}` },
      });
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        removeTag(key);
        if (document.activeElement === input) refreshSuggestions();
      });
      chip.append(el("span", { className: "clt-chip-label", text }), remove);
      fragment.append(chip);
    }
    box.insertBefore(fragment, input);
  }

  input.addEventListener("input", refreshSuggestions);
  input.addEventListener("focus", refreshSuggestions);
  input.addEventListener("blur", () => {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
  });
  input.addEventListener("keydown", (event) => {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
        event.preventDefault();
        if (list.hidden) refreshSuggestions();
        else moveActive(event.key === "ArrowDown" ? 1 : -1);
        break;
      case "Enter":
        event.preventDefault();
        if (!list.hidden && active >= 0) commit(suggestions[active].label);
        else commit(input.value);
        break;
      case "Escape":
        if (!list.hidden) {
          event.preventDefault();
          event.stopPropagation();
          list.hidden = true;
          input.setAttribute("aria-expanded", "false");
        }
        break;
      case "Backspace":
        if (input.value === "") {
          const last = [...readTags().keys()].pop();
          if (last) {
            removeTag(last);
            refreshSuggestions();
          }
        }
        break;
    }
  });
  // Keep focus in the input while a suggestion is clicked.
  list.addEventListener("pointerdown", (event) => event.preventDefault());
  box.addEventListener("click", (event) => {
    if (event.target === box) input.focus();
  });

  return {
    label: labelElement,
    box,
    render() {
      renderChips();
      if (document.activeElement === input) refreshSuggestions();
    },
  };
}

// ── Library view ──

function findAnchors(root) {
  const searchInput = root.querySelector("input.mari-chrome-field");
  const headerRow = searchInput?.closest(".grid")?.parentElement;
  const header = headerRow?.parentElement;
  if (!searchInput || !headerRow || !header || !root.contains(header)) return null;
  return { searchInput, headerRow, header };
}

function onSearchInput() {
  renderFilters();
}

function setPanelOpen(open) {
  view.open = open;
  view.panel.hidden = !open;
  view.toggle.setAttribute("aria-expanded", String(open));
}

function mount(root, anchors) {
  includedTags.clear();
  catalog.requestedIds.clear();

  const toggle = el("button", {
    className: "mari-chrome-control clt-toggle",
    attrs: { type: "button", title: "Tag filters", "aria-label": "Tag filters", "aria-controls": "clt-panel" },
  });
  const badge = el("span", { className: "clt-toggle-badge", attrs: { hidden: "" } });
  toggle.append(createTagIcon(), badge);
  toggle.addEventListener("click", () => setPanelOpen(!view.open));

  const includeField = createTagField({
    id: "clt-include",
    label: "At least one tag:",
    chipClass: "clt-chip--include",
    readTags: () => includedTags,
    addTag: addIncludedTag,
    removeTag: removeIncludedTag,
    canAdd: () => true,
  });
  const excludeField = createTagField({
    id: "clt-exclude",
    label: "Excluded tags:",
    chipClass: "mari-chrome-control--danger clt-chip--exclude",
    readTags: readExcludedTags,
    addTag: addExcludedTag,
    removeTag: removeExcludedTag,
    canAdd: canExclude,
    disabledReason: 'Tags containing " cannot be excluded with search syntax',
  });
  const hint = el("p", { className: "clt-hint", attrs: { "aria-live": "polite" } });
  const panel = el("div", { className: "clt-panel", attrs: { id: "clt-panel" } });
  panel.append(includeField.label, includeField.box, excludeField.label, excludeField.box, hint);

  view = { root, searchInput: null, toggle, badge, panel, includeField, excludeField, hint, open: false };
  setPanelOpen(false);
  attach(anchors);
  renderFilters();
  void refreshCatalog();
}

function attach({ searchInput, headerRow, header }) {
  if (view.searchInput !== searchInput) {
    view.searchInput?.removeEventListener("input", onSearchInput);
    view.searchInput = searchInput;
    searchInput.addEventListener("input", onSearchInput);
  }
  if (view.toggle.parentElement !== headerRow) headerRow.append(view.toggle);
  if (view.panel.parentElement !== header) header.append(view.panel);
}

function unmount() {
  if (!view) return;
  view.searchInput?.removeEventListener("input", onSearchInput);
  view.toggle.remove();
  view.panel.remove();
  view = null;
  includedTags.clear();
  renderIncludeStyle();
}

function renderHint() {
  const ids = new Set(
    [...view.root.querySelectorAll(`[${CARD_ATTRIBUTE}]`)].map((node) => node.getAttribute(CARD_ATTRIBUTE)),
  );
  if (catalog.loaded) {
    const unknown = [...ids].filter((id) => id && !catalog.idToTags.has(id) && !catalog.requestedIds.has(id));
    if (unknown.length) {
      for (const id of unknown) catalog.requestedIds.add(id);
      scheduleCatalogRefresh();
    }
  }

  let text = "";
  if (includedTags.size > 0) {
    if (!catalog.loaded) {
      text = "Loading tags…";
    } else {
      const excluded = [...readExcludedTags().keys()];
      let visible = 0;
      for (const id of ids) if (matchesIncluded(catalog.idToTags.get(id))) visible += 1;
      let total = 0;
      for (const tags of catalog.idToTags.values()) {
        if (matchesIncluded(tags) && !excluded.some((key) => tags.has(key))) total += 1;
      }
      text = `Showing ${visible} of ${total} characters with these tags.`;
      if (visible < total) text += " Use Load more, or clear the search text, to see the rest.";
    }
  }
  if (view.hint.textContent !== text) view.hint.textContent = text;
  view.hint.hidden = !text;
}

function renderFilters() {
  if (!view) return;
  view.includeField.render();
  view.excludeField.render();
  renderIncludeStyle();
  const active = includedTags.size + readExcludedTags().size;
  const badgeText = active ? String(active) : "";
  if (view.badge.textContent !== badgeText) view.badge.textContent = badgeText;
  view.badge.hidden = !active;
  view.toggle.classList.toggle("mari-chrome-control--selected", active > 0);
  renderHint();
}

function sync() {
  frame = 0;
  const root = document.querySelector(ROOT_SELECTOR);
  // The persona library uses the same component; only act on characters.
  const target = root?.querySelector(CHARACTER_KIND_SELECTOR) ? root : null;
  if (view && view.root !== target) unmount();
  if (!target) return;
  const anchors = findAnchors(target);
  if (!anchors) return;
  if (view) attach(anchors);
  else mount(target, anchors);
  renderHint();
}

const observer = new MutationObserver(() => {
  if (!frame) frame = requestAnimationFrame(sync);
});
observer.observe(document.body, { childList: true, subtree: true });
sync();

marinara.onCleanup(() => {
  stopped = true;
  observer.disconnect();
  if (frame) cancelAnimationFrame(frame);
  unmount();
  styleElement.remove();
});

marinara.log.info("Character Library Tag Filter loaded");
