// Character Manager: a full-screen character browser modelled on SillyTavern's
// AnotherCharManager. Everything is filtered and sorted in the browser from
// the catalog summary (CLMData + CLM), so mandatory / any-of / excluded tags,
// text scopes and sorts combine freely and cover the whole library at once.
//
// Open it by right-clicking Marinara's "Open Library" button, or with the
// grid button next to the tag filter in the full Character Library.

const CLMManager = (() => {
  "use strict";

  const PREFS_KEY = "managerPrefs";
  const PRESETS_KEY = "savedSearches";
  const CARD_WIDTH = { min: 80, max: 240, step: 10, initial: 130 };
  const GRID_GAP = 10;
  const SERVER_SEARCH_DELAY = 300;
  const DETAIL_DELAY = 120;
  const CLOUD_LIMIT = 80;
  const SVG_NS = "http://www.w3.org/2000/svg";

  // Lucide icon geometry (https://lucide.dev, ISC).
  const ICONS = {
    tag: [
      ["path", { d: "M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" }],
      ["circle", { cx: "7.5", cy: "7.5", r: ".5", fill: "currentColor" }],
    ],
    star: [["path", { d: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" }]],
    dice: [
      ["rect", { x: "3", y: "3", width: "18", height: "18", rx: "2" }],
      ["path", { d: "M16 8h.01M8 8h.01M8 16h.01M16 16h.01M12 12h.01" }],
    ],
    shuffle: [["path", { d: "m18 14 4 4-4 4M18 2l4 4-4 4M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22M2 6h1.972a4 4 0 0 1 3.6 2.2M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45" }]],
    x: [["path", { d: "M18 6 6 18M6 6l12 12" }]],
    refresh: [["path", { d: "M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8M21 3v5h-5" }]],
    sliders: [["path", { d: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" }]],
    hash: [["path", { d: "M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" }]],
    search: [
      ["circle", { cx: "11", cy: "11", r: "8" }],
      ["path", { d: "m21 21-4.3-4.3" }],
    ],
    pencil: [["path", { d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" }]],
    chat: [["path", { d: "M7.9 20A9 9 0 1 0 4 16.1L2 22Z" }]],
    user: [
      ["path", { d: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" }],
      ["circle", { cx: "12", cy: "7", r: "4" }],
    ],
    grid: [
      ["rect", { x: "3", y: "3", width: "7", height: "7", rx: "1" }],
      ["rect", { x: "14", y: "3", width: "7", height: "7", rx: "1" }],
      ["rect", { x: "14", y: "14", width: "7", height: "7", rx: "1" }],
      ["rect", { x: "3", y: "14", width: "7", height: "7", rx: "1" }],
    ],
    chevron: [["path", { d: "m6 9 6 6 6-6" }]],
    plus: [["path", { d: "M5 12h14M12 5v14" }]],
    folder: [["path", { d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" }]],
    check: [["path", { d: "M20 6 9 17l-5-5" }]],
    link: [["path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" }]],
    copy: [
      ["rect", { x: "8", y: "8", width: "14", height: "14", rx: "2" }],
      ["path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" }],
    ],
    alert: [["path", { d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4M12 17h.01" }]],
    trash: [["path", { d: "M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" }]],
    bookmark: [["path", { d: "m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" }]],
  };

  function icon(name, className = "clm-icon") {
    const svg = document.createElementNS(SVG_NS, "svg");
    for (const [k, v] of Object.entries({
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
      class: className,
    }))
      svg.setAttribute(k, v);
    for (const [tag, attrs] of ICONS[name]) {
      const child = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) child.setAttribute(k, v);
      svg.append(child);
    }
    return svg;
  }

  /** Small element builder: h("div.a.b", { attrs, on, text }, ...children). */
  function h(spec, props = {}, ...children) {
    const [tag, ...classes] = spec.split(".");
    const node = document.createElement(tag || "div");
    if (classes.length) node.className = classes.join(" ");
    const { text, on, attrs, ...rest } = props;
    if (text !== undefined) node.textContent = text;
    for (const [k, v] of Object.entries(attrs ?? {})) if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? "" : v);
    for (const [k, v] of Object.entries(on ?? {})) node.addEventListener(k, v);
    Object.assign(node, rest);
    for (const child of children.flat()) if (child !== null && child !== undefined && child !== false) node.append(child);
    return node;
  }

  /**
   * A native select shown as a compact button: an icon and/or a short label,
   * with the real select laid invisibly on top so the opened list still shows
   * every option in full.
   */
  function compactSelect(select, { iconName = null, label = () => "" } = {}) {
    const text = h("span.clm-compact-label");
    const box = h(
      "span.clm-btn.clm-compact",
      { attrs: { title: select.title } },
      iconName ? icon(iconName) : null,
      text,
      icon("chevron", "clm-icon clm-compact-chevron"),
      select,
    );
    select.classList.add("clm-compact-select");
    box.sync = () => {
      const option = select.selectedOptions[0] ?? null;
      const value = option ? label(option) : "";
      if (text.textContent !== value) text.textContent = value;
      text.hidden = !value;
      box.title = option && option.value ? `${select.title}: ${option.textContent}` : select.title;
    };
    select.addEventListener("change", box.sync);
    return box;
  }

  function iconButton(name, title, onClick, extraClass = "") {
    return h(
      `button.clm-btn.clm-icon-btn${extraClass ? `.${extraClass}` : ""}`,
      { attrs: { type: "button", title, "aria-label": title }, on: { click: onClick } },
      icon(name),
    );
  }

  const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
  const formatDate = (ms) => (ms ? dateFormat.format(new Date(ms)) : "—");
  const formatTokens = (n) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
  const plural = (n, one, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

  // ── State ──

  const S = {
    built: false,
    open: false,
    query: CLM.emptyQuery(),
    labels: new Map(), // tag key -> label typed by the user (for tags not in the index)
    sort: "name-asc",
    seed: 1,
    cardWidth: CARD_WIDTH.initial,
    showTagRows: true,
    showAdvanced: false,
    showCloud: false,
    canonicalOnly: false,
    foldVariants: false,
    canonical: null, // Set of canonical tag keys (Tag Merger)
    expand: null, // Map for fold variants (Tag Merger)
    index: CLM.buildIndex([]),
    indexedItems: null,
    indexedImageTags: null,
    imageTags: null, // Char Triage picture tags: id -> ["image:…"]
    results: [],
    facets: new Map(),
    serverKey: "",
    serverIds: null,
    serverError: "",
    selectedId: null,
    lastViewedId: null,
    // Char Triage (optional): dislike scores, and new ones held back while they would reorder the list.
    scores: null,
    scoresPending: false,
    triageDecisions: null, // Char Triage: card id -> latest decision (kept cards show a check)
    viewed: new Set(), // opened in the details pane this session (implied keeps on close)
    multi: new Set(), // ids picked with Ctrl/Shift-click or the card checkboxes
    anchorId: null, // last plain or Ctrl click, for Shift-click ranges
    indexedFolders: null,
    loadError: "",
    loading: false,
    detailsDirty: false,
    presets: [], // [{ name, query, sort, labels }]
  };

  const ui = {}; // DOM references, filled by build()
  let renderFrame = 0;
  let serverTimer = 0;
  let detailTimer = 0;
  let detailToken = 0;
  let prefsTimer = 0;
  let unsubscribe = null;

  // ── Preferences (marinara.storage) ──

  async function loadPrefs() {
    try {
      const stored = await marinara.storage.get();
      if (Array.isArray(stored?.[PRESETS_KEY])) S.presets = stored[PRESETS_KEY].filter((p) => p && typeof p.name === "string" && p.query);
      const saved = stored?.[PREFS_KEY];
      if (!saved || typeof saved !== "object") return;
      if (saved.sort in CLM.SORTS) S.sort = saved.sort;
      if (CLM.SCOPES.includes(saved.scope)) S.query.scope = saved.scope;
      if (Number.isFinite(saved.cardWidth)) {
        S.cardWidth = Math.min(CARD_WIDTH.max, Math.max(CARD_WIDTH.min, saved.cardWidth));
      }
      for (const key of ["showTagRows", "showAdvanced", "showCloud", "canonicalOnly", "foldVariants"]) {
        if (typeof saved[key] === "boolean") S[key] = saved[key];
      }
    } catch (error) {
      marinara.log.warn("Could not read Character Manager preferences", error);
    }
  }

  function savePrefs() {
    marinara.clearTimeout(prefsTimer);
    prefsTimer = marinara.setTimeout(() => {
      const prefs = {
        sort: S.sort,
        scope: S.query.scope,
        cardWidth: S.cardWidth,
        showTagRows: S.showTagRows,
        showAdvanced: S.showAdvanced,
        showCloud: S.showCloud,
        canonicalOnly: S.canonicalOnly,
        foldVariants: S.foldVariants,
      };
      marinara.storage.patch({ [PREFS_KEY]: prefs }).catch((error) => marinara.log.warn("Could not save preferences", error));
    }, 400);
  }

  // ── Saved searches (ACM presets) ──

  const sameQuery = (preset) => JSON.stringify(preset.query) === JSON.stringify(S.query) && preset.sort === S.sort;

  function renderPresets() {
    const select = ui.presetSelect;
    const current = S.presets.find(sameQuery);
    const options = [h("option", { text: S.presets.length ? "Saved searches…" : "Save search…", value: "" })];
    for (const [i, preset] of S.presets.entries()) options.push(h("option", { text: preset.name, value: `load:${i}` }));
    options.push(h("option", { text: "Save current search…", value: "save" }));
    if (current) options.push(h("option", { text: `Delete “${current.name}”`, value: `delete:${S.presets.indexOf(current)}` }));
    const signature = options.map((o) => `${o.value}=${o.textContent}`).join("|");
    if (select.dataset.signature !== signature) {
      select.replaceChildren(...options);
      select.dataset.signature = signature;
    }
    select.value = current ? `load:${S.presets.indexOf(current)}` : "";
    ui.presetBox.classList.toggle("clm-on", !!current);
    ui.presetBox.sync();
  }

  function savePresets() {
    marinara.storage.patch({ [PRESETS_KEY]: S.presets }).catch((error) => CLMEdit.toast(`Could not save: ${error.message}`, { error: true }));
  }

  function onPresetChoice(select) {
    const [action, index] = select.value.split(":");
    select.value = "";
    if (action === "load") {
      const preset = S.presets[Number(index)];
      if (!preset) return;
      S.query = { ...CLM.emptyQuery(), ...structuredClone(preset.query) };
      if (preset.sort in CLM.SORTS) S.sort = preset.sort;
      for (const [key, label] of Object.entries(preset.labels ?? {})) S.labels.set(key, label);
      ui.searchInput.value = S.query.text;
      update();
    } else if (action === "save") {
      const name = window.prompt("Name for this search:", "")?.trim();
      if (!name) return update();
      const labels = {};
      for (const key of chipKeys()) labels[key] = labelOf(key);
      const preset = { name, query: structuredClone(S.query), sort: S.sort, labels };
      const existing = S.presets.findIndex((p) => p.name === name);
      if (existing >= 0) S.presets[existing] = preset;
      else S.presets.push(preset);
      savePresets();
      update();
    } else if (action === "delete") {
      S.presets.splice(Number(index), 1);
      savePresets();
      update();
    } else update();
  }

  // ── Tags helpers ──

  const labelOf = (key) => S.index.tags.get(key)?.label ?? S.labels.get(key) ?? key;
  const chipKeys = () => new Set([...S.query.mandatory, ...S.query.anyOf, ...S.query.excluded]);
  /** Canonical-only mode hides other tags from suggestions, the cloud and card chips. */
  function visibleTag(key) {
    if (!S.canonicalOnly || !S.canonical || S.canonical.size === 0 || CLM.isImageTag(key)) return true;
    return S.canonical.has(key) || chipKeys().has(key);
  }
  const visibleFilter = () => (S.canonicalOnly && S.canonical?.size ? visibleTag : null);

  /**
   * Suggestions: Char Triage picture tags only once you type "image:", so they
   * never crowd the card tags; the tag cloud leaves them out.
   */
  function suggestFilter(text) {
    const typed = CLM.normalizeTag(String(text).replace(/^[-!~#]+/u, "")).startsWith(CLM.IMAGE_PREFIX);
    const base = visibleFilter();
    return (key) => (CLM.isImageTag(key) ? typed : !base || base(key));
  }
  const cloudFilter = () => {
    const base = visibleFilter();
    return (key) => !CLM.isImageTag(key) && (!base || base(key));
  };

  function addChip(kind, label) {
    const key = CLM.normalizeTag(String(label).replace(/^#+/u, ""));
    if (!key) return;
    for (const other of ["mandatory", "anyOf", "excluded"]) {
      S.query[other] = S.query[other].filter((k) => k !== key);
    }
    S.query[kind] = [...S.query[kind], key];
    if (!S.index.tags.has(key)) S.labels.set(key, String(label).trim());
    update();
  }

  function removeChip(kind, key) {
    S.query[kind] = S.query[kind].filter((k) => k !== key);
    update();
  }

  /** Click on a tag anywhere: plain = mandatory (toggle), Shift = any-of, Alt/Ctrl/right = exclude. */
  function tagClick(event, key) {
    event.preventDefault();
    event.stopPropagation();
    const kind = event.type === "contextmenu" || event.altKey || event.ctrlKey || event.metaKey ? "excluded" : event.shiftKey ? "anyOf" : "mandatory";
    if (S.query[kind].includes(key)) removeChip(kind, key);
    else addChip(kind, labelOf(key));
  }

  const TAG_CLICK_HINT = "Click: must have · Shift-click: at least one · Alt-click or right-click: exclude";

  // ── Suggestion dropdown (shared by the tag rows and the search box) ──

  function attachSuggest(input, wrapper, { compute, pick, onKey }) {
    const list = h("ul.clm-suggest", { attrs: { role: "listbox", hidden: true } });
    wrapper.append(list);
    let items = [];
    let active = -1;

    function render() {
      const open = document.activeElement === input && items.length > 0;
      list.replaceChildren(
        ...items.map((item, i) =>
          h(
            "li.clm-suggest-item",
            {
              attrs: { role: "option", "aria-selected": String(i === active) },
              on: { click: () => choose(i) },
            },
            h("span.clm-suggest-label", { text: item.label }),
            h("span.clm-suggest-count", {
              text: item.matching === item.count ? String(item.count) : `${item.matching} / ${item.count}`,
              attrs: { title: `${item.matching} in current results, ${item.count} in the library` },
            }),
          ),
        ),
      );
      list.hidden = !open;
      input.setAttribute("aria-expanded", String(open));
      if (open && active >= 0) list.children[active]?.scrollIntoView({ block: "nearest" });
    }

    function refresh() {
      items = compute() ?? [];
      active = items.length ? 0 : -1;
      render();
    }

    function choose(i) {
      const item = items[i];
      if (!item) return;
      pick(item);
      refresh();
    }

    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.addEventListener("input", refresh);
    input.addEventListener("focus", refresh);
    input.addEventListener("blur", () => {
      list.hidden = true;
      input.setAttribute("aria-expanded", "false");
    });
    list.addEventListener("pointerdown", (event) => event.preventDefault());
    input.addEventListener("keydown", (event) => {
      const open = !list.hidden && items.length > 0;
      if (open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        active = (active + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        render();
        return;
      }
      if (open && (event.key === "Enter" || event.key === "Tab") && active >= 0 && !event.shiftKey) {
        event.preventDefault();
        choose(active);
        return;
      }
      if (open && event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        items = [];
        render();
        return;
      }
      onKey?.(event);
    });
    return { refresh, close: () => ((items = []), render()) };
  }

  // ── Tag rows (ACM "Mandatory / At least one / Excluded") ──

  function chipField(kind, labelText, chipClass) {
    const input = h("input.clm-chip-input", {
      attrs: { type: "text", autocomplete: "off", spellcheck: "false", "aria-label": labelText, placeholder: "Add tag…" },
    });
    const chips = h("span.clm-chips");
    const box = h("div.clm-chip-box", { on: { click: (e) => e.target === box && input.focus() } }, chips, input);
    const suggest = attachSuggest(input, box, {
      compute: () =>
        CLM.suggestTags(S.index.tags, input.value, { facets: S.facets, taken: chipKeys(), visible: suggestFilter(input.value), limit: 12 }),
      pick: (item) => {
        input.value = "";
        addChip(kind, item.label);
      },
      onKey: (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          if (input.value.trim()) {
            addChip(kind, input.value.trim());
            input.value = "";
          }
        } else if (event.key === "Backspace" && input.value === "" && S.query[kind].length) {
          removeChip(kind, S.query[kind][S.query[kind].length - 1]);
        }
      },
    });
    const row = h(
      "div.clm-tag-row",
      {},
      h("label.clm-tag-row-label", { text: labelText }),
      box,
    );
    return {
      row,
      render() {
        chips.replaceChildren(
          ...S.query[kind].map((key) =>
            h(
              `span.clm-chip.${chipClass}${CLM.isImageTag(key) ? ".clm-chip--image" : ""}`,
              { attrs: { title: CLM.isImageTag(key) ? "Char Triage picture tag (not on the card)" : null } },
              h("span.clm-chip-label", { text: labelOf(key) }),
              h("button.clm-chip-remove", {
                text: "×",
                attrs: { type: "button", title: `Remove ${labelOf(key)}`, "aria-label": `Remove ${labelOf(key)}` },
                on: {
                  click: (e) => {
                    e.stopPropagation();
                    removeChip(kind, key);
                  },
                },
              }),
            ),
          ),
        );
        if (document.activeElement === input) suggest.refresh();
      },
    };
  }

  // ── Build ──

  // Inputs whose value mirrors query state, refreshed on render (saved searches, Clear).
  const boundInputs = [];
  function bound(input, read) {
    boundInputs.push({ input, read });
    return input;
  }
  const isoDay = (ms) => (ms === null || ms === undefined ? "" : new Date(ms).toISOString().slice(0, 10));
  function syncBoundInputs() {
    for (const { input, read } of boundInputs) {
      if (document.activeElement === input) continue;
      const value = read();
      if (input.type === "checkbox") input.checked = !!value;
      else {
        const text = value === null || value === undefined ? "" : String(value);
        if (input.value !== text) input.value = text;
      }
    }
  }

  function numberInput(placeholder, onChange) {
    return h("input.clm-input.clm-number", {
      attrs: { type: "number", min: "0", placeholder, inputmode: "numeric" },
      on: {
        input: (e) => {
          const v = e.target.value.trim();
          onChange(v === "" ? null : Math.max(0, Number(v)));
        },
      },
    });
  }

  function dateInput(label, onChange) {
    return h("input.clm-input.clm-date", {
      attrs: { type: "date", "aria-label": label, title: label },
      on: { change: (e) => onChange(e.target.value ? Date.parse(e.target.value) : null) },
    });
  }

  /** "Tag every result": add or remove one tag on all characters currently shown. */
  function bulkTagGroup() {
    const input = h("input.clm-input.clm-bulk-tag", {
      attrs: { type: "text", placeholder: "tag", list: "clm-all-tags", autocomplete: "off", "aria-label": "Tag for every result" },
    });
    const run = (mode) => {
      const label = input.value.trim();
      if (!label) return input.focus();
      void CLMEdit.bulkTag(S.results, mode, S.index.tags.get(CLM.normalizeTag(label))?.label ?? label);
    };
    return h(
      "div.clm-adv-group.clm-bulk",
      { attrs: { title: "Add or remove a tag on every character in the current results" } },
      h("span.clm-label", { text: "All results:" }),
      input,
      h("button.clm-btn", { text: "Add tag", attrs: { type: "button" }, on: { click: () => run("add") } }),
      h("button.clm-btn", { text: "Remove tag", attrs: { type: "button" }, on: { click: () => run("remove") } }),
    );
  }

  function toggleButton(name, title, key, onToggle) {
    const button = iconButton(name, title, () => {
      S[key] = !S[key];
      onToggle?.();
      savePrefs();
      update();
    });
    button.dataset.toggle = key;
    return button;
  }

  function build() {
    // Toolbar
    const sortSelect = h(
      "select.clm-select",
      {
        attrs: { title: "Sort order", "aria-label": "Sort order" },
        on: {
          change: (e) => {
            S.sort = e.target.value;
            savePrefs();
            update();
          },
        },
      },
      Object.entries(CLM.SORTS).map(([value, label]) => h("option", { text: label, value })),
    );
    const reshuffle = iconButton("shuffle", "Shuffle again", () => {
      S.seed = (S.seed * 48271 + 1) % 2147483647;
      update();
    });
    const scopeSelect = h(
      "select.clm-select.clm-scope",
      {
        attrs: { title: "Search in", "aria-label": "Search in" },
        on: {
          change: (e) => {
            S.query.scope = e.target.value;
            savePrefs();
            update();
          },
        },
      },
      [
        ["any", "Name, creator & tags"],
        ["name", "Name"],
        ["creator", "Creator"],
        ["tags", "Tags"],
        ["all", "All card text"],
      ].map(([value, label]) => h("option", { text: label, value })),
    );
    const searchInput = h("input.clm-input.clm-search", {
      attrs: {
        type: "search",
        placeholder: "Search…  #tag  -#tag  ~tag  creator:name",
        autocomplete: "off",
        spellcheck: "false",
        "aria-label": "Search characters",
        title:
          'Words must all match. "two words" matches a phrase, -word excludes.\n#tag or tag:"two words" = must have, -#tag = exclude, ~tag = at least one.\ncreator:name filters by creator.',
      },
    });
    // Clears through the editing commands, so Ctrl+Z in the box brings the text back.
    let clearedText = null; // fallback undo when execCommand is unavailable
    const searchClear = h(
      "button.clm-search-clear",
      {
        attrs: { type: "button", title: "Clear search (Ctrl+Z puts it back)", "aria-label": "Clear search", hidden: true },
        on: {
          pointerdown: (event) => event.preventDefault(), // keep focus in the box
          click: () => {
            const text = searchInput.value;
            if (!text) return;
            searchInput.focus();
            searchInput.select();
            let done = false;
            try {
              done = document.execCommand("delete");
            } catch {
              done = false;
            }
            if (!done || searchInput.value) {
              clearedText = text;
              searchInput.value = "";
              searchInput.dispatchEvent(new Event("input", { bubbles: true }));
            }
          },
        },
      },
      icon("x"),
    );
    searchInput.addEventListener("keydown", (event) => {
      if (clearedText !== null && !searchInput.value && (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        searchInput.value = clearedText;
        clearedText = null;
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    const searchWrap = h("div.clm-search-wrap", {}, icon("search", "clm-icon clm-search-icon"), searchInput, searchClear);
    attachSuggest(searchInput, searchWrap, {
      compute: () => {
        const token = currentTagToken(searchInput);
        if (!token) return [];
        return CLM.suggestTags(S.index.tags, token.value, { facets: S.facets, taken: chipKeys(), visible: suggestFilter(token.value), limit: 10 });
      },
      pick: (item) => {
        const token = currentTagToken(searchInput);
        if (!token) return;
        const value = searchInput.value;
        searchInput.value = `${value.slice(0, token.start)}${value.slice(token.end)}`.replace(/\s{2,}/gu, " ").trimStart();
        addChip(token.kind, item.label);
        S.query.text = searchInput.value;
        update();
      },
      onKey: (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          absorbTagTokens(true);
        }
      },
    });
    searchInput.addEventListener("input", () => {
      if (searchInput.value) clearedText = null;
      absorbTagTokens(false);
      syncSearchClear();
    });

    const triageButton = h(
      "button.clm-btn.clm-triage",
      { attrs: { type: "button", title: "Char Triage: scan, scores, tags you delete (Alt+Shift+T)", hidden: true }, on: { click: () => CLMData.charTriage()?.openPanel?.() } },
      "Triage",
    );
    const scoresButton = h(
      "button.clm-btn.clm-on.clm-scores-pending",
      { attrs: { type: "button", title: "Char Triage has new scores or picture tags. Apply them (the results may change).", hidden: true }, on: { click: () => applyScores() } },
      "New Char Triage results",
    );
    const favButton = iconButton("star", "Favorites only", () => {
      S.query.favoritesOnly = !S.query.favoritesOnly;
      update();
    });
    const count = h("span.clm-count", { attrs: { "aria-live": "polite" } });
    const folderSelect = h("select.clm-select.clm-folder-filter", {
      attrs: { title: "Folder", "aria-label": "Folder" },
      on: {
        change: (e) => {
          S.query.folder = e.target.value || null;
          update();
        },
      },
    });
    const presetSelect = h("select.clm-select.clm-presets", {
      attrs: { title: "Saved searches", "aria-label": "Saved searches" },
      on: { change: (e) => onPresetChoice(e.target) },
    });
    const clearButton = h("button.clm-btn.clm-clear", {
      text: "Clear",
      attrs: { type: "button", title: "Clear search and every filter" },
      on: { click: clearAll },
    });
    const widthSlider = h("input.clm-width", {
      attrs: {
        type: "range",
        min: String(CARD_WIDTH.min),
        max: String(CARD_WIDTH.max),
        step: String(CARD_WIDTH.step),
        title: "Card size",
        "aria-label": "Card size",
      },
      on: {
        input: (e) => {
          S.cardWidth = Number(e.target.value);
          ui.popup.style.setProperty("--clm-card-width", `${S.cardWidth}px`);
          savePrefs();
          ui.grid.relayout();
        },
      },
    });

    const SCOPE_SHORT = { any: "All", name: "Name", creator: "Creator", tags: "Tags", all: "Full text" };
    const scopeBox = compactSelect(scopeSelect, { label: (o) => SCOPE_SHORT[o.value] ?? o.textContent });
    const presetBox = compactSelect(presetSelect, { iconName: "bookmark" });
    const folderBox = compactSelect(folderSelect, {
      iconName: "folder",
      label: (o) => (o.value === "none" ? "No folder" : o.value === "some" ? "In a folder" : o.value ? (S.index.folderById.get(o.value)?.name ?? "") : ""),
    });
    sortSelect.title = "Sorted by";
    const toolbar = h(
      "div.clm-toolbar",
      {},
      h(
        "div.clm-toolbar-group",
        {},
        toggleButton("tag", "Tag filters", "showTagRows"),
        toggleButton("sliders", "More filters", "showAdvanced"),
        toggleButton("hash", "Tag cloud", "showCloud"),
      ),
      h("div.clm-toolbar-group", {}, sortSelect, reshuffle, scoresButton),
      h("div.clm-toolbar-group.clm-grow", {}, scopeBox, searchWrap, presetBox),
      h(
        "div.clm-toolbar-group",
        {},
        folderBox,
        favButton,
        iconButton("dice", "Random character", pickRandom),
        iconButton("refresh", "Reload the library", () => void refresh(true)),
        widthSlider,
        triageButton,
      ),
      h("div.clm-toolbar-group.clm-toolbar-end", {}, count, clearButton, iconButton("x", "Close (Esc)", close, "clm-close")),
    );

    // Tag rows
    const fields = [
      chipField("mandatory", "Mandatory tags:", "clm-chip--mandatory"),
      chipField("anyOf", "At least one tag:", "clm-chip--any"),
      chipField("excluded", "Excluded tags:", "clm-chip--excluded"),
    ];
    const canonicalBox = h("input", {
      attrs: { type: "checkbox" },
      on: {
        change: async (e) => {
          S.canonicalOnly = e.target.checked;
          savePrefs();
          await loadTagMerger();
          update();
        },
      },
    });
    const foldBox = h("input", {
      attrs: { type: "checkbox" },
      on: {
        change: async (e) => {
          S.foldVariants = e.target.checked;
          savePrefs();
          await loadTagMerger();
          rebuildIndex();
          update();
        },
      },
    });
    const canonicalLabel = h("label.clm-check", { attrs: { title: "" } }, canonicalBox, " Canonical tags only");
    const foldLabel = h("label.clm-check", {}, foldBox, " Match variant spellings");
    const tagMergerRow = h("div.clm-tagmerger", {}, h("span.clm-label", { text: "Tag Merger:" }), canonicalLabel, foldLabel);
    const tagRows = h("div.clm-tag-rows", {}, ...fields.map((f) => f.row), tagMergerRow);

    // Char Triage keeps: one button that cycles blank (any) -> ✓ (only kept) -> ✗ (hide kept).
    const KEPT_STATES = [
      [null, "", "Kept cards: shown (click: only kept)"],
      ["only", "✓", "Only cards you kept (click: hide kept)"],
      ["hide", "✗", "Kept cards hidden (click: show all)"],
    ];
    const keptButton = h("button.clm-btn.clm-kept-toggle", {
      attrs: { type: "button" },
      on: {
        click: () => {
          const at = KEPT_STATES.findIndex(([v]) => v === (S.query.kept ?? null));
          S.query.kept = KEPT_STATES[(at + 1) % KEPT_STATES.length][0];
          update();
        },
      },
    });
    const keptToggle = h("div.clm-adv-group.clm-kept-group", { attrs: { hidden: true } }, h("span.clm-label", { text: "Kept" }), keptButton);
    const renderKeptToggle = () => {
      const [, mark, title] = KEPT_STATES.find(([v]) => v === (S.query.kept ?? null)) ?? KEPT_STATES[0];
      keptButton.textContent = mark;
      keptButton.title = title;
      keptButton.setAttribute("aria-label", title);
      keptButton.classList.toggle("clm-on", !!S.query.kept);
      // Only with Char Triage running (or while the filter is on, so it can be turned off).
      keptToggle.hidden = !CLMData.charTriage() && !S.query.kept;
    };

    // Advanced filters
    const advanced = h(
      "div.clm-advanced",
      {},
      h(
        "div.clm-adv-group",
        {},
        h("span.clm-label", { text: "Tags" }),
        bound(numberInput("min", (v) => ((S.query.tagCount = { ...S.query.tagCount, min: v }), update())), () => S.query.tagCount.min),
        h("span", { text: "–" }),
        bound(numberInput("max", (v) => ((S.query.tagCount = { ...S.query.tagCount, max: v }), update())), () => S.query.tagCount.max),
      ),
      h(
        "div.clm-adv-group",
        {},
        h("span.clm-label", { text: "Tokens" }),
        bound(numberInput("min", (v) => ((S.query.tokens = { ...S.query.tokens, min: v }), update())), () => S.query.tokens.min),
        h("span", { text: "–" }),
        bound(numberInput("max", (v) => ((S.query.tokens = { ...S.query.tokens, max: v }), update())), () => S.query.tokens.max),
      ),
      h(
        "div.clm-adv-group",
        {},
        h("span.clm-label", { text: "Added" }),
        bound(dateInput("Added on or after", (v) => ((S.query.created = { ...S.query.created, from: v }), update())), () => isoDay(S.query.created.from)),
        h("span", { text: "–" }),
        // Inclusive end date: the whole day counts.
        bound(dateInput("Added on or before", (v) => ((S.query.created = { ...S.query.created, to: v === null ? null : v + 86399999 }), update())), () => isoDay(S.query.created.to)),
      ),
      h(
        "label.clm-check",
        {},
        bound(
          h("input", {
            attrs: { type: "checkbox" },
            on: { change: (e) => ((S.query.untaggedOnly = e.target.checked), update()) },
          }),
          () => S.query.untaggedOnly,
        ),
        " Untagged only",
      ),
      keptToggle,
      bulkTagGroup(),
    );

    // Body: tag cloud | grid, details below
    const cloud = h("aside.clm-cloud", { attrs: { "aria-label": "Tags in results", title: TAG_CLICK_HINT } });
    const viewport = h("div.clm-grid", { attrs: { tabindex: "0", role: "listbox", "aria-label": "Characters" } });
    const empty = h("div.clm-empty", { attrs: { hidden: true } });
    const gridWrap = h("div.clm-grid-wrap", {}, viewport, empty);
    const details = h("section.clm-details", { attrs: { hidden: true, "aria-label": "Character details" } });
    const body = h("div.clm-body", {}, cloud, gridWrap, details);
    const selectionBar = buildSelectionBar();

    const popup = h(
      "div.clm-popup",
      { attrs: { role: "dialog", "aria-modal": "true", "aria-label": "Character Manager" } },
      toolbar,
      tagRows,
      advanced,
      selectionBar.node,
      body,
    );
    const lock = h("div.clm-lock", { attrs: { hidden: true } }, popup);
    lock.addEventListener("pointerdown", (event) => {
      if (event.target === lock) close();
    });
    // Keep Marinara's global shortcuts out of the manager while it is open.
    lock.addEventListener("keydown", onKeyDown);
    lock.addEventListener("keyup", (e) => e.stopPropagation());
    lock.addEventListener("keypress", (e) => e.stopPropagation());
    document.body.append(lock);

    Object.assign(ui, {
      lock,
      popup,
      toolbar,
      sortSelect,
      reshuffle,
      scopeSelect,
      searchInput,
      presetSelect,
      folderSelect,
      scopeBox,
      presetBox,
      folderBox,
      favButton,
      renderKeptToggle,
      triageButton,
      scoresButton,
      count,
      clearButton,
      widthSlider,
      fields,
      tagRows,
      tagMergerRow,
      canonicalBox,
      foldBox,
      canonicalLabel,
      foldLabel,
      advanced,
      cloud,
      viewport,
      empty,
      details,
      selectionBar,
    });

    ui.grid = CLMVirtualGrid.create(viewport, {
      gap: GRID_GAP,
      size: () => ({ width: S.cardWidth, heightFor: (w) => Math.round(w * 1.5) + 46 }),
      create: createCard,
      update: updateCard,
      // Hold the open card in place when the details pane resizes the grid; after closing, the one just viewed.
      anchorId: () => S.selectedId ?? S.lastViewedId,
    });
    viewport.addEventListener("click", onGridClick);
    viewport.addEventListener("dblclick", onGridDoubleClick);
    viewport.addEventListener("keydown", onGridKey);
    S.built = true;
  }

  // ── Search box tokens ──

  /** The tag token under the caret (#…, ~…, -#…, tag:…, any:…), for suggestions. */
  function currentTagToken(input) {
    const caret = input.selectionStart ?? input.value.length;
    for (const token of CLM.tokenize(input.value)) {
      if (token.start <= caret && caret <= token.end && ["mandatory", "anyOf", "excluded"].includes(token.kind)) {
        return token;
      }
    }
    return null;
  }

  /** Turn finished tag tokens in the search box into chips. */
  function absorbTagTokens(final) {
    const value = ui.searchInput.value;
    const { chips, rest } = CLM.takeTagTokens(value, final);
    if (chips.length) {
      ui.searchInput.value = rest;
      for (const chip of chips) addChip(chip.kind, chip.label);
    }
    S.query.text = ui.searchInput.value;
    update();
  }

  // ── Cards ──

  function createCard(card) {
    const node = h("div.clm-card", { attrs: { role: "option", "data-id": card.id } });
    const media = h("div.clm-card-media");
    const avatar = card.item.avatarPath;
    if (avatar) {
      const img = h("img", { attrs: { alt: "", loading: "lazy", decoding: "async", draggable: "false" } });
      img.addEventListener("error", () => img.replaceWith(placeholder(card)), { once: true });
      img.src = avatar;
      media.append(img);
    } else {
      media.append(placeholder(card));
    }
    const star = h("span.clm-card-fav", { attrs: { title: "Favorite" } }, icon("star"));
    const name = h("div.clm-card-name");
    const meta = h("div.clm-card-meta");
    const check = h("button.clm-card-check", { attrs: { type: "button", tabindex: "-1", "aria-label": "Select" } }, icon("check"));
    const folder = h("span.clm-card-folder", {}, icon("folder"));
    const score = h("span.clm-card-score");
    node.append(media, star, name, meta, check, folder, score);
    return node;
  }

  function placeholder(card) {
    return h("div.clm-card-placeholder", { text: (card.name.match(/\p{L}|\p{N}/u)?.[0] ?? "?").toUpperCase() });
  }

  function updateCard(node, card, index) {
    if (node.dataset.index !== String(index)) {
      node.dataset.index = String(index);
      node.setAttribute("aria-posinset", String(index + 1));
      node.setAttribute("aria-setsize", String(S.results.length));
    }
    const name = node.children[2];
    if (name.textContent !== card.name) name.textContent = card.name;
    name.style.color = card.item.nameColor ?? "";
    const meta = `${plural(card.tagCount, "tag")} · ${formatTokens(card.tokens)} tok`;
    if (node.children[3].textContent !== meta) node.children[3].textContent = meta;
    node.title = card.creator ? `${card.name}\nby ${card.creator}` : card.name;
    node.classList.toggle("clm-card--selected", card.id === S.selectedId);
    node.classList.toggle("clm-card--checked", S.multi.has(card.id));
    const folders = card.folderIds.map((id) => S.index.folderById.get(id)?.name).filter(Boolean);
    node.classList.toggle("clm-card--in-folder", folders.length > 0);
    if (folders.length) node.children[5].title = `In ${folders.join(", ")}`;
    node.classList.toggle("clm-card--fav", card.favorite);
    const score = S.scores?.get(card.id);
    // Kept (marked fine) cards show a check instead of their number, so cleared false positives stand out.
    const kept = S.triageDecisions?.get(card.id) === "keep";
    const band = kept ? "kept" : score === undefined ? "" : String(CLM.scoreBand(score));
    const badge = node.children[6];
    if (badge.dataset.band !== band) {
      badge.dataset.band = band;
      badge.textContent = kept ? "✓" : band;
      badge.title = kept
        ? `Kept: you marked this fine for Char Triage${score === undefined ? "" : ` (it scores ${CLM.scoreBand(score)} of 5)`}`
        : band
          ? `Char Triage: ${band} of 5 (${Math.round(score * 100)}% likely disliked)`
          : "";
    }
    node.setAttribute("aria-selected", String(card.id === S.selectedId));
  }

  /**
   * Click: show one character. Ctrl/Cmd-click or the checkbox: add to the selection.
   * Shift-click: select a range. While some are selected, a plain click anywhere on a
   * card adds or removes it too; Esc or Clear ends the selection.
   */
  function onGridClick(event) {
    const node = event.target.closest(".clm-card");
    if (!node) return;
    const id = node.dataset.id;
    if (event.shiftKey) {
      event.preventDefault();
      selectRange(S.anchorId ?? S.selectedId ?? id, id);
    } else if (event.ctrlKey || event.metaKey || S.multi.size || event.target.closest(".clm-card-check")) {
      if (!S.multi.size && S.selectedId && S.selectedId !== id) S.multi.add(S.selectedId);
      toggleMulti(id);
      S.anchorId = id;
      // Show the card just added in the details pane.
      if (S.multi.has(id) && S.selectedId !== id) select(id);
    } else {
      S.anchorId = id;
      select(id);
    }
  }

  function toggleMulti(id) {
    if (S.multi.has(id)) S.multi.delete(id);
    else S.multi.add(id);
    renderSelection();
  }

  function selectRange(fromId, toId) {
    const a = S.results.findIndex((c) => c.id === fromId);
    const b = S.results.findIndex((c) => c.id === toId);
    if (a < 0 || b < 0) return toggleMulti(toId);
    for (let i = Math.min(a, b); i <= Math.max(a, b); i += 1) S.multi.add(S.results[i].id);
    renderSelection();
  }

  function clearMulti() {
    S.multi.clear();
    renderSelection();
  }

  /** Selected characters that still exist, in the current sort order where shown. */
  function selectedCards() {
    const shown = S.results.filter((c) => S.multi.has(c.id));
    const shownIds = new Set(shown.map((c) => c.id));
    const hidden = [...S.multi].filter((id) => !shownIds.has(id)).map((id) => S.index.byId.get(id)).filter(Boolean);
    return [...shown, ...hidden];
  }

  function renderSelection() {
    ui.popup.classList.toggle("clm-has-multi", S.multi.size > 0);
    ui.grid.refresh();
    ui.selectionBar.render();
  }

  function onGridDoubleClick(event) {
    const node = event.target.closest(".clm-card");
    if (node) void CLMBridge.edit(S.index.byId.get(node.dataset.id)?.item);
  }

  function onGridKey(event) {
    if (!S.results.length) return;
    const at = Math.max(0, S.results.findIndex((c) => c.id === S.selectedId));
    const cols = ui.grid.columns;
    const page = Math.max(cols, Math.floor(ui.viewport.clientHeight / ui.grid.rowHeight) * cols);
    const moves = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: cols,
      ArrowUp: -cols,
      PageDown: page,
      PageUp: -page,
      Home: -Infinity,
      End: Infinity,
    };
    if (event.key in moves) {
      event.preventDefault();
      const next = S.selectedId === null ? 0 : Math.min(S.results.length - 1, Math.max(0, at + moves[event.key]));
      select(S.results[next].id, { scroll: true });
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      for (const card of S.results) S.multi.add(card.id);
      renderSelection();
    } else if (event.key === "Enter" && S.selectedId) {
      event.preventDefault();
      void CLMBridge.edit(S.index.byId.get(S.selectedId)?.item);
    }
  }

  function select(id, { scroll = false } = {}) {
    S.selectedId = id;
    if (id) {
      S.lastViewedId = id;
      S.viewed.add(id);
    }
    ui.grid.refresh();
    if (scroll) ui.grid.scrollToIndex(S.results.findIndex((c) => c.id === id));
    renderDetails();
  }

  // ── Char Triage ──

  /** Do scores decide what is shown or where (so new ones would move cards under you)? */
  const scoresShape = () =>
    S.sort === "dislike-desc" ||
    /(^|\s)-?score:/iu.test(S.query.text ?? "") ||
    /(^|[\s#~-])image:/iu.test(S.query.text ?? "") ||
    [...chipKeys()].some(CLM.isImageTag);

  /** Decisions are never held back: a Keep should show its check at once. */
  function loadDecisions() {
    const triage = CLMData.charTriage();
    S.triageDecisions = typeof triage?.decisions === "function" ? triage.decisions() : null;
  }

  function loadScores() {
    loadDecisions();
    const triage = CLMData.charTriage();
    S.scores = triage?.scores() ?? null;
    S.imageTags = typeof triage?.imageTags === "function" ? triage.imageTags() : null;
    S.scoresPending = false;
  }

  function applyScores() {
    loadScores();
    update();
  }

  /**
   * Char Triage retrains after decisions and while scanning. Badges update at
   * once; when the scores sort or filter the list, the new ones wait for the
   * "New scores" button (or the next open), so the list does not reshuffle
   * while you work through it.
   */
  const onTriageChanged = () => {
    if (!S.built) return;
    if (!S.open || !S.scores || !scoresShape()) applyScores();
    else {
      loadDecisions();
      S.scoresPending = true;
      update();
    }
  };
  window.addEventListener("marinara-char-triage:changed", onTriageChanged);

  async function keepSelected() {
    const triage = CLMData.charTriage();
    const cards = selectedCards();
    if (!triage || !cards.length) return;
    try {
      await triage.recordKeep(cards.map((c) => c.item));
      CLMEdit.toast(`Marked ${plural(cards.length, "character")} as fine for Char Triage.`);
      clearMulti();
    } catch (error) {
      CLMEdit.toast(`Could not record the keep: ${error.message}`, { error: true });
    }
  }

  async function scanSelected() {
    const triage = CLMData.charTriage();
    const cards = selectedCards();
    if (typeof triage?.scanCards !== "function" || !cards.length) return;
    try {
      const n = await triage.scanCards(cards.map((c) => c.id));
      CLMEdit.toast(n ? `Char Triage is asking about ${plural(n, "character")}.` : "Char Triage already has every answer for these.");
    } catch (error) {
      CLMEdit.toast(`Char Triage could not scan: ${error.message}`, { error: true });
    }
  }

  /** Cards opened in the details pane and not deleted count as a weak "fine" for Char Triage. */
  function recordImpliedKeeps() {
    const triage = CLMData.charTriage();
    const ids = [...S.viewed].filter((id) => S.index?.byId.has(id));
    S.viewed.clear();
    if (!triage || !ids.length) return;
    void triage.recordKeep(ids.map((id) => S.index.byId.get(id).item), { implied: true }).catch((error) => marinara.log.warn("Char Triage could not record implied keeps", error));
  }

  function pickRandom() {
    if (!S.results.length) return;
    const card = S.results[Math.floor(Math.random() * S.results.length)];
    select(card.id, { scroll: true });
  }

  // ── Folders ──

  function renderFolderSelect() {
    const select = ui.folderSelect;
    const folders = S.index.folders;
    const unfiled = S.index.cards.reduce((n, c) => n + (c.folderIds.length ? 0 : 1), 0);
    const options = [
      ["", "All folders"],
      ["none", `In no folder (${unfiled.toLocaleString()})`],
      ["some", `In a folder (${(S.index.cards.length - unfiled).toLocaleString()})`],
      ...folders.map((f) => [f.id, `${f.name} (${f.count.toLocaleString()})`]),
    ];
    const signature = options.map(([v, t]) => `${v}=${t}`).join("|");
    if (select.dataset.signature !== signature) {
      select.replaceChildren(...options.map(([value, text]) => h("option", { text, value })));
      select.dataset.signature = signature;
    }
    select.value = S.query.folder ?? "";
    ui.folderBox.classList.toggle("clm-on", !!S.query.folder);
    ui.folderBox.hidden = folders.length === 0 && !S.query.folder;
    ui.folderBox.sync();
  }

  function folderChip(id, card) {
    const folder = S.index.folderById.get(id);
    if (!folder) return null;
    const chip = h(
      `span.clm-chip.clm-chip--tag.clm-chip--folder${S.query.folder === id ? ".clm-chip--mandatory" : ""}`,
      {
        attrs: { title: "Show this folder", tabindex: "0", role: "button" },
        on: {
          click: () => {
            S.query.folder = S.query.folder === id ? null : id;
            update();
          },
        },
      },
      h("span.clm-chip-label", { text: folder.name }),
    );
    chip.append(CLMEdit.removeFromFolderButton(folder, [card]));
    return chip;
  }

  /** Bar shown while characters are selected: tag them or file them in folders. */
  function buildSelectionBar() {
    const label = h("span.clm-selbar-count");
    const tagInput = h("input.clm-input.clm-bulk-tag", {
      attrs: { type: "text", placeholder: "tag", list: "clm-all-tags", autocomplete: "off", "aria-label": "Tag for the selected characters" },
    });
    const runTag = (mode) => {
      const typed = tagInput.value.trim();
      if (!typed) return tagInput.focus();
      void CLMEdit.bulkTag(selectedCards(), mode, S.index.tags.get(CLM.normalizeTag(typed))?.label ?? typed);
    };
    const folderSlot = h("span.clm-selbar-folders");
    const node = h(
      "div.clm-selbar",
      { attrs: { hidden: true, role: "toolbar", "aria-label": "Selected characters" } },
      label,
      h("button.clm-btn", { text: "Select all results", attrs: { type: "button", title: "Ctrl+A in the grid" }, on: { click: () => (S.results.forEach((c) => S.multi.add(c.id)), renderSelection()) } }),
      h("button.clm-btn", { text: "Clear", attrs: { type: "button", title: "Esc" }, on: { click: clearMulti } }),
      h("span.clm-selbar-sep"),
      h("span.clm-label", { text: "Tag:" }),
      tagInput,
      h("button.clm-btn", { text: "Add", attrs: { type: "button" }, on: { click: () => runTag("add") } }),
      h("button.clm-btn", { text: "Remove", attrs: { type: "button" }, on: { click: () => runTag("remove") } }),
      h("span.clm-selbar-sep"),
      folderSlot,
      h("span.clm-selbar-sep"),
      h(
        "button.clm-btn.clm-selbar-scan",
        { attrs: { type: "button", title: "Ask Char Triage's vision model about these cards now (only the questions each still needs)" }, on: { click: () => void scanSelected() } },
        "Ask Char Triage",
      ),
      h(
        "button.clm-btn.clm-selbar-keep",
        { attrs: { type: "button", title: "These are fine: Char Triage learns from it" }, on: { click: () => void keepSelected() } },
        icon("check"),
        " Keep",
      ),
      h(
        "button.clm-btn.clm-btn--danger",
        { attrs: { type: "button", title: "Permanently delete the selected characters (asks first)" }, on: { click: () => void CLMEdit.deleteCards(selectedCards()) } },
        icon("trash"),
        " Delete",
      ),
    );
    let lastSignature = "";
    return {
      node,
      render() {
        const cards = selectedCards();
        node.hidden = cards.length === 0;
        node.querySelector(".clm-selbar-keep").hidden = !CLMData.charTriage();
        node.querySelector(".clm-selbar-scan").hidden = typeof CLMData.charTriage()?.scanCards !== "function";
        if (!cards.length) {
          lastSignature = "";
          return;
        }
        const shown = cards.filter((c) => S.results.includes(c)).length;
        label.textContent = `${plural(cards.length, "selected", "selected")}${shown < cards.length ? ` (${cards.length - shown} hidden by filters)` : ""}`;
        // Rebuild the folder controls only when the selection or folders change.
        const signature = `${cards.map((c) => c.id).join(",")}|${S.indexedFolders?.length}|${S.index.folders.map((f) => f.count).join(",")}`;
        if (signature !== lastSignature) {
          lastSignature = signature;
          folderSlot.replaceChildren(
            CLMEdit.folderPicker(cards, { label: "Add to folder…" }),
            CLMEdit.folderPicker(cards, { label: "Remove from folder…", mode: "remove" }),
          );
        }
      },
    };
  }

  // ── Details pane ──

  function tagChip(key, { card = null } = {}) {
    const inQuery = S.query.mandatory.includes(key)
      ? "clm-chip--mandatory"
      : S.query.anyOf.includes(key)
        ? "clm-chip--any"
        : S.query.excluded.includes(key)
          ? "clm-chip--excluded"
          : "";
    const chip = h(
      `span.clm-chip.clm-chip--tag${inQuery ? `.${inQuery}` : ""}${CLM.isImageTag(key) ? ".clm-chip--image" : ""}`,
      {
        attrs: { title: TAG_CLICK_HINT, tabindex: "0", role: "button" },
        on: {
          click: (e) => tagClick(e, key),
          contextmenu: (e) => tagClick(e, key),
          keydown: (e) => e.key === "Enter" && tagClick(e, key),
        },
      },
      h("span.clm-chip-label", { text: labelOf(key) }),
    );
    if (card) {
      const remove = CLMEdit.removeTagButton(card, key);
      if (remove) chip.append(remove);
    }
    return chip;
  }

  /** Full-size avatar over the manager; any click or key closes it. */
  function showPreview(src, name) {
    const preview = h("div.clm-preview", { attrs: { role: "dialog", "aria-label": `${name} avatar`, tabindex: "-1" } }, h("img", { attrs: { src, alt: name } }));
    const closePreview = (event) => {
      event?.stopPropagation();
      preview.remove();
    };
    preview.addEventListener("click", closePreview);
    preview.addEventListener("keydown", (e) => {
      e.preventDefault();
      closePreview(e);
    });
    ui.popup.append(preview);
    preview.focus();
  }

  function infoItem(label, value, title) {
    return h("div.clm-info", { attrs: { title: title ?? null } }, h("span.clm-info-label", { text: label }), h("span.clm-info-value", { text: value }));
  }

  function renderDetails() {
    const card = S.selectedId ? S.index.byId.get(S.selectedId) : null;
    ui.details.hidden = !card;
    ui.popup.classList.toggle("clm-has-details", !!card);
    if (!card) return;
    const item = card.item;
    const avatar = item.avatarPath
      ? h("img.clm-details-avatar.clm-zoomable", {
          attrs: { src: item.avatarPath, alt: card.name, draggable: "false", title: "Show full size" },
          on: { click: () => showPreview(item.avatarPath, card.name) },
        })
      : h("div.clm-details-avatar.clm-card-placeholder", { text: placeholder(card).textContent });

    const creator = card.creator
      ? h("button.clm-link", {
          text: card.creator,
          attrs: { type: "button", title: "Show everything by this creator" },
          on: {
            click: () => {
              ui.searchInput.value = CLM.quoteToken("creator:", card.creator);
              S.query.text = ui.searchInput.value;
              update();
            },
          },
        })
      : h("span.clm-muted", { text: "unknown creator" });

    const shownTags = card.tagList.filter((key) => visibleTag(key));
    const hiddenCount = card.tagList.length - shownTags.length;
    const tags = h(
      "div.clm-details-tags",
      {},
      shownTags.map((key) => tagChip(key, { card })),
      hiddenCount ? h("span.clm-muted", { text: `+${hiddenCount} non-canonical`, attrs: { title: card.tagList.filter((k) => !visibleTag(k)).map(labelOf).join(", ") } }) : null,
      CLMEdit.addTagField(card),
    );

    const folderRow = h(
      "div.clm-details-folders",
      {},
      icon("folder", "clm-icon clm-muted"),
      card.folderIds.length
        ? card.folderIds.map((id) => folderChip(id, card))
        : h("span.clm-muted", { text: "No folder" }),
      CLMEdit.folderPicker([card], { label: "+ folder" }),
    );

    const actions = h(
      "div.clm-details-actions",
      {},
      CLMEdit.favoriteButton(card),
      h("button.clm-btn", { attrs: { type: "button", title: "Open Marinara's character editor" }, on: { click: () => void CLMBridge.edit(item) } }, icon("pencil"), " Edit"),
      h("button.clm-btn", { attrs: { type: "button", title: "Start a chat with this character" }, on: { click: () => void CLMBridge.chat(item) } }, icon("chat"), " Chat"),
      CLMEdit.keepButton([card]),
      CLMData.isProtected(card.id) ? null : CLMEdit.deleteButton([card]),
    );

    const sourceRow = h("div.clm-details-source", { attrs: { hidden: true } });
    const drawers = h("div.clm-drawers");
    // Char Triage's picture tags: closed by default, clickable like tags.
    const pictureTags = card.imageList?.length
      ? h(
          "details.clm-drawer.clm-picture-tags",
          {},
          h("summary", {}, h("span", { text: "Picture tags" }), h("span.clm-muted", { text: ` ${card.imageList.length} · from Char Triage, not on the card` })),
          h("div.clm-details-tags", {}, card.imageList.map((key) => tagChip(key))),
        )
      : null;
    const summary = h("p.clm-details-summary", { text: item.summary ?? "" });

    ui.details.replaceChildren(
      h(
        "div.clm-details-head",
        {},
        avatar,
        h(
          "div.clm-details-main",
          {},
          h("div.clm-details-title", {}, h("h2.clm-details-name", { text: card.name, attrs: { style: item.nameColor ? `color:${item.nameColor}` : null } }), h("span.clm-muted", { text: " by " }), creator),
          h(
            "div.clm-info-grid",
            {},
            infoItem("Version", item.version || "—"),
            infoItem("Added", formatDate(card.created), item.createdAt),
            infoItem("Updated", formatDate(card.updated), item.updatedAt),
            infoItem("Tokens", `~${card.tokens.toLocaleString()}`, "Marinara's estimate for the whole card"),
            infoItem("Tags", String(card.rawTagCount)),
          ),
          actions,
          tags,
          folderRow,
          sourceRow,
        ),
        iconButton("x", "Close details", () => select(null), "clm-details-close"),
      ),
      summary,
      pictureTags,
      drawers,
    );

    // Full text is loaded lazily, after the selection settles.
    const token = ++detailToken;
    marinara.clearTimeout(detailTimer);
    detailTimer = marinara.setTimeout(async () => {
      try {
        const full = await CLMData.getCharacter(card.id);
        if (token !== detailToken) return;
        const d = full.data ?? {};
        renderSourceRow(sourceRow, CLM.sourceLinks(d));
        const sections = [
          ["Description", d.description],
          ["First message", d.first_mes],
          ["Scenario", d.scenario],
          ["Personality", d.personality],
          ["Creator's notes", d.creator_notes],
        ].filter(([, text]) => typeof text === "string" && text.trim());
        const alternates = Array.isArray(d.alternate_greetings) ? d.alternate_greetings.filter((g) => typeof g === "string" && g.trim()) : [];
        alternates.forEach((g, i) => sections.push([`Alternate greeting ${i + 1}`, g]));
        // The catalog summary is usually the start of one of these; don't show it twice.
        const snippet = (item.summary ?? "").trim().slice(0, 60);
        if (snippet && sections.some(([, text]) => text.trim().startsWith(snippet))) summary.remove();
        drawers.replaceChildren(
          ...sections.map(([title, text], i) =>
            h(
              "details.clm-drawer",
              { open: i === 0 },
              h("summary", {}, h("span", { text: title }), h("span.clm-muted", { text: ` ~${marinaraTokens(text)} tok` })),
              h("div.clm-drawer-text", { text }),
            ),
          ),
        );
      } catch (error) {
        if (token !== detailToken) return;
        drawers.replaceChildren(h("p.clm-error", { text: `Could not load the full card: ${error.message}` }));
      }
    }, DETAIL_DELAY);
  }

  /** Links to the page the card was downloaded from, each with a copy button. */
  function renderSourceRow(row, links) {
    row.hidden = false;
    if (!links.length) {
      row.replaceChildren(icon("link", "clm-icon clm-muted"), h("span.clm-muted", { text: "No download link saved", attrs: { title: "Marinara keeps the link for cards imported through its Bot Browser, and for Chub cards" } }));
      return;
    }
    row.replaceChildren(
      icon("link", "clm-icon clm-muted"),
      ...links.map((link) =>
        h(
          "span.clm-source",
          {},
          h("a.clm-source-link", { text: `Open on ${link.label}`, attrs: { href: link.url, target: "_blank", rel: "noopener noreferrer", title: link.url } }),
          h("button.clm-btn.clm-icon-btn.clm-source-copy", { attrs: { type: "button", title: `Copy ${link.url}`, "aria-label": `Copy the ${link.label} link` }, on: { click: () => void copyText(link.url) } }, icon("copy")),
        ),
      ),
    );
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API needs a secure context; fall back to a selected textarea.
      const area = h("textarea", { attrs: { style: "position:fixed;opacity:0" } });
      area.value = text;
      document.body.append(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      if (!ok) return CLMEdit.toast(`Could not copy. The link is ${text}`, { error: true, duration: 12000 });
    }
    CLMEdit.toast("Link copied.", { duration: 2500 });
  }

  const marinaraTokens = (text) =>
    typeof marinara.estimateTextTokens === "function" ? marinara.estimateTextTokens(text).toLocaleString() : Math.ceil(text.length / 4).toLocaleString();

  // ── Compute & render ──

  function rebuildIndex() {
    const expand = S.foldVariants ? S.expand : null;
    S.index = CLM.buildIndex(CLMData.items, { expand, folders: CLMData.folders, imageTags: S.imageTags });
    S.indexedItems = CLMData.items;
    S.indexedImageTags = S.imageTags;
    S.indexedFolders = CLMData.folders;
    if (S.query.folder && !["none", "some"].includes(S.query.folder) && !S.index.folderById.has(S.query.folder)) S.query.folder = null;
  }

  function scheduleServerSearch() {
    const terms = CLM.serverTerms(S.query);
    const key = terms.join("\n");
    if (key === S.serverKey) return;
    S.serverKey = key;
    S.serverIds = null;
    S.serverError = "";
    marinara.clearTimeout(serverTimer);
    if (!terms.length) return;
    serverTimer = marinara.setTimeout(async () => {
      try {
        const ids = await CLMData.searchAllTerms(terms);
        if (S.serverKey !== key) return;
        S.serverIds = ids;
      } catch (error) {
        if (S.serverKey !== key) return;
        S.serverError = error.message;
      }
      update();
    }, SERVER_SEARCH_DELAY);
  }

  let lastScrollKey = "";
  // Where you were in each recent view (query + sort), so clearing a filter puts
  // you back where you left the full list. Card ids, not pixels: survives deletes.
  const VIEW_MEMORY = 10;
  const viewAnchors = new Map(); // scrollKey -> grid anchor, oldest first

  function compute() {
    if (S.indexedItems !== CLMData.items || S.indexedFolders !== CLMData.folders || S.indexedImageTags !== S.imageTags) rebuildIndex();
    scheduleServerSearch();
    const filtered = CLM.filter(S.index, S.query, { serverIds: S.serverIds, scores: S.scores, decisions: S.triageDecisions });
    S.results = CLM.sortCards(filtered, S.sort, S.seed, { scores: S.scores });
    S.facets = CLM.facetCounts(S.results);
  }

  function update() {
    if (!S.built) return;
    if (!renderFrame) renderFrame = requestAnimationFrame(render);
  }

  function render() {
    renderFrame = 0;
    if (!S.open) return;
    // Held-back scores no longer move anything once the sort/filter stops using them.
    if (S.scoresPending && !scoresShape()) loadScores();
    compute();
    const q = S.query;

    // Toolbar state
    ui.sortSelect.value = S.sort;
    ui.reshuffle.hidden = S.sort !== "random";
    ui.triageButton.hidden = !CLMData.charTriage();
    ui.renderKeptToggle();
    ui.scoresButton.hidden = !S.scoresPending;
    ui.scopeSelect.value = q.scope;
    ui.scopeBox.sync();
    if (document.activeElement !== ui.searchInput && ui.searchInput.value !== q.text) ui.searchInput.value = q.text;
    syncSearchClear();
    ui.favButton.classList.toggle("clm-on", q.favoritesOnly);
    ui.favButton.setAttribute("aria-pressed", String(q.favoritesOnly));
    for (const button of ui.toolbar.querySelectorAll("[data-toggle]")) {
      const key = button.dataset.toggle;
      if (key in S && typeof S[key] === "boolean") {
        button.classList.toggle("clm-on", S[key]);
        button.setAttribute("aria-pressed", String(S[key]));
      }
    }
    ui.widthSlider.value = String(S.cardWidth);
    syncBoundInputs();
    renderPresets();
    ui.popup.style.setProperty("--clm-card-width", `${S.cardWidth}px`);

    const active = CLM.activeFilterCount(q);
    const total = S.index.cards.length;
    let status = S.loading && !total ? "Loading…" : `${S.results.length.toLocaleString()} of ${total.toLocaleString()}`;
    if (q.scope === "all" && CLM.serverTerms(q).length) {
      status += S.serverError ? " · text search failed" : S.serverIds === null ? " · searching card text…" : "";
    }
    if (S.loadError) status = S.loadError;
    ui.count.textContent = status;
    ui.count.title = S.serverError || S.loadError || `${S.results.length.toLocaleString()} of ${plural(total, "character")} shown`;
    ui.clearButton.hidden = active === 0;
    renderFolderSelect();
    for (const id of S.multi) if (!S.index.byId.has(id)) S.multi.delete(id);
    ui.popup.classList.toggle("clm-has-multi", S.multi.size > 0);
    ui.selectionBar.render();

    // Rows
    ui.tagRows.hidden = !S.showTagRows;
    for (const field of ui.fields) field.render();
    renderTagMergerRow();
    ui.advanced.hidden = !S.showAdvanced;
    ui.cloud.hidden = !S.showCloud;
    if (S.showCloud) renderCloud();
    if (S.showAdvanced) CLMEdit.updateTagDatalist();

    // Grid
    const scrollKey = JSON.stringify([q, S.sort, S.seed]);
    const sameView = scrollKey === lastScrollKey;
    const here = ui.grid.anchor();
    if (!sameView && lastScrollKey) {
      viewAnchors.delete(lastScrollKey);
      if (here) viewAnchors.set(lastScrollKey, here);
      while (viewAnchors.size > VIEW_MEMORY) viewAnchors.delete(viewAnchors.keys().next().value);
    }
    lastScrollKey = scrollKey;
    // Same view: hold the top card (deletes above it do not shift you). New view:
    // back to where you left it, or the top.
    ui.grid.setItems(S.results, { keepScroll: sameView, anchor: sameView ? here : viewAnchors.get(scrollKey) });
    ui.empty.hidden = S.results.length > 0 || (S.loading && !total);
    if (!ui.empty.hidden) {
      ui.empty.textContent = total ? "No characters match these filters." : S.loadError || "Your library is empty.";
    }
    if (S.selectedId && !S.index.byId.has(S.selectedId)) S.selectedId = null;
    for (const id of S.multi) if (!S.index.byId.has(id)) S.multi.delete(id);
    if (S.detailsDirty) {
      S.detailsDirty = false;
      if (S.selectedId) renderDetails();
    }
    if (!S.selectedId) {
      ui.details.hidden = true;
      ui.popup.classList.remove("clm-has-details");
    }
  }

  function renderCloud() {
    const top = CLM.topTags(S.index.tags, S.facets, { limit: CLOUD_LIMIT, exclude: chipKeys(), visible: cloudFilter() });
    const max = top[0]?.matching ?? 1;
    ui.cloud.replaceChildren(
      h("div.clm-cloud-title", { text: "Tags in results" }),
      ...top.map((t) =>
        h(
          "button.clm-cloud-tag",
          {
            attrs: { type: "button", title: `${t.matching} of ${t.count} · ${TAG_CLICK_HINT}`, style: `--clm-weight:${(0.35 + 0.65 * (t.matching / max)).toFixed(2)}` },
            on: { click: (e) => tagClick(e, t.key), contextmenu: (e) => tagClick(e, t.key) },
          },
          h("span", { text: t.label }),
          h("span.clm-cloud-count", { text: String(t.matching) }),
        ),
      ),
    );
  }

  function renderTagMergerRow() {
    const status = CLMData.tagMerger();
    ui.canonicalBox.checked = S.canonicalOnly;
    ui.foldBox.checked = S.foldVariants;
    ui.canonicalBox.disabled = !status.available;
    ui.foldBox.disabled = !status.available;
    const reason = status.available ? "" : status.reason;
    ui.canonicalLabel.title = reason || "Show only Tag Merger's canonical tags in suggestions, the tag cloud and the details pane.";
    ui.foldLabel.title = reason || "Match tags through Tag Merger's dictionary, so a canonical tag also finds its variant spellings and implied tags.";
    ui.tagMergerRow.classList.toggle("clm-disabled", !status.available);
  }

  async function loadTagMerger() {
    if (!CLMData.tagMerger().available) {
      S.canonical = null;
      S.expand = null;
      return;
    }
    try {
      if (S.canonicalOnly) S.canonical = await CLMData.canonicalKeys(CLM.normalizeTag);
      if (S.foldVariants) S.expand = await CLMData.tagExpansion(CLM.normalizeTag);
    } catch (error) {
      marinara.log.warn("Could not read Tag Merger's dictionary", error);
    }
  }

  function syncSearchClear() {
    const button = ui.searchInput?.parentElement?.querySelector(".clm-search-clear");
    if (button) button.hidden = !ui.searchInput.value;
  }

  function clearAll() {
    // Scope and the kept filter are ways of looking, not filters to clear while reviewing.
    const { scope, kept } = S.query;
    S.query = { ...CLM.emptyQuery(), scope, kept };
    S.labels.clear();
    ui.searchInput.value = "";
    update();
  }

  // ── Open / close ──

  async function refresh(force) {
    S.loading = true;
    S.loadError = "";
    update();
    try {
      if (force || CLMData.loaded) await CLMData.revalidate();
      else await CLMData.load();
      // Folder edits do not change the catalog generation, so read them every time.
      try {
        await CLMData.loadFolders();
      } catch (error) {
        marinara.log.warn("Character Manager could not load folders", error);
      }
      if (S.foldVariants && CLMData.tagMerger().available) S.expand = await CLMData.tagExpansion(CLM.normalizeTag);
      rebuildIndex();
    } catch (error) {
      S.loadError = `Could not load characters: ${error.message}`;
      marinara.log.error("Character Manager could not load the library", error);
    } finally {
      S.loading = false;
      update();
    }
  }

  async function open() {
    if (S.open) return;
    if (!S.built) {
      await loadPrefs();
      build();
    }
    S.open = true;
    ui.lock.hidden = false;
    loadScores();
    unsubscribe ??= CLMData.subscribe(() => {
      S.detailsDirty = true;
      update();
    });
    update();
    ui.searchInput.focus();
    await loadTagMerger();
    await refresh(false);
  }

  function close({ hiding = false } = {}) {
    if (!S.open) return;
    S.open = false;
    ui.lock.hidden = true;
    marinara.clearTimeout(detailTimer);
    if (!hiding) recordImpliedKeeps();
  }

  /** Hide without losing state (the bridge uses this while Marinara's own UI opens). */
  const hide = () => close({ hiding: true });
  const show = () => void open();

  function onKeyDown(event) {
    event.stopPropagation();
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      if (S.multi.size && !/^(INPUT|TEXTAREA|SELECT)$/u.test(document.activeElement?.tagName ?? "")) clearMulti();
      else if (S.selectedId && document.activeElement === ui.viewport) select(null);
      else close();
      return;
    }
    if (event.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/u.test(document.activeElement?.tagName ?? "")) {
      event.preventDefault();
      ui.searchInput.focus();
    }
  }

  // Tag Merger tells other extensions when its dictionary changes.
  const onTagMergerChanged = () => {
    if (!S.open) return;
    void loadTagMerger().then(() => {
      if (S.foldVariants) rebuildIndex();
      update();
    });
  };
  window.addEventListener("marinara-tag-merger:changed", onTagMergerChanged);

  marinara.onCleanup(() => {
    window.removeEventListener("marinara-tag-merger:changed", onTagMergerChanged);
    window.removeEventListener("marinara-char-triage:changed", onTriageChanged);
    unsubscribe?.();
    if (renderFrame) cancelAnimationFrame(renderFrame);
    marinara.clearTimeout(serverTimer);
    marinara.clearTimeout(detailTimer);
    marinara.clearTimeout(prefsTimer);
    ui.grid?.destroy();
    ui.lock?.remove();
  });

  return Object.freeze({
    open,
    close,
    hide,
    show,
    update,
    select,
    renderDetails,
    clearSelection: clearMulti,
    get isOpen() {
      return S.open;
    },
    get state() {
      return S;
    },
    /** The manager window, for dialogs that sit on top of it. */
    get popup() {
      return ui.popup ?? null;
    },
    icon,
    h,
  });
})();
