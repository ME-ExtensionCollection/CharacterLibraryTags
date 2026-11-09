// Mock of the parts of Marinara's UI the extension touches:
//  - CharactersPanel's "Open Library" button (CharacterLibraryActions, svg.lucide-users)
//  - CharacterLibraryView: search box (input.mari-chrome-field inside the toolbar .grid),
//    paged cards with data-card-library-card, and the detail card with Edit
//    (svg.lucide-pencil) / Chat now (svg.lucide-message-circle) buttons.
// Markup follows packages/client/src/components/characters/CharacterLibraryView.tsx
// and packages/client/src/components/panels/CharactersPanel.tsx only as far as
// the extension's selectors need.
(() => {
  "use strict";

  const SVG = (name) =>
    `<svg class="lucide lucide-${name}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/></svg>`;
  const events = [];
  window.__mockUi = { events };

  function panel() {
    const section = document.createElement("section");
    section.setAttribute("data-component", "CharactersPanelScroll");
    section.className = "mock-panel";
    section.innerHTML = `
      <div data-component="CharacterLibraryActions" class="mari-chrome-segmented">
        <button type="button" class="mari-chrome-segmented__button" title="Download">${SVG("bot")}<span>Download</span></button>
        <button type="button" class="mari-chrome-segmented__button" id="mock-open-library" title="Open characters library">${SVG("users")}<span>Open Library</span></button>
      </div>`;
    section.querySelector("#mock-open-library").addEventListener("click", () => openLibrary());
    return section;
  }

  let libraryRoot = null;
  let state = { search: "", offset: 0, items: [], hasMore: false, total: 0, selected: null, token: 0 };

  async function loadPage(reset) {
    const token = ++state.token;
    const offset = reset ? 0 : state.items.length;
    const params = new URLSearchParams({ limit: "50", offset: String(offset), sort: "name-asc" });
    // Marinara strips -tag: tokens client side and sends the rest as `search`.
    const text = state.search.replace(/(?:^|\s)(?:-|!)(?:tag:|#)?(?:"[^"]+"|\S+)/g, " ").trim();
    if (text) params.set("search", text);
    const page = await (await fetch(`/api/characters/catalog?${params}`)).json();
    if (token !== state.token || !libraryRoot) return;
    state.items = reset ? page.items : [...state.items, ...page.items];
    state.hasMore = page.hasMore;
    state.total = page.total;
    renderCards();
  }

  function renderCards() {
    const grid = libraryRoot.querySelector("#mock-library-grid");
    grid.replaceChildren(
      ...state.items.map((item) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "mock-library-card";
        card.setAttribute("data-card-library-card", item.id);
        card.textContent = item.name;
        card.addEventListener("click", () => {
          state.selected = item;
          renderDetail();
        });
        return card;
      }),
    );
    libraryRoot.querySelector("#mock-library-count").textContent = `${state.items.length} / ${state.total}`;
    libraryRoot.querySelector("#mock-library-more").hidden = !state.hasMore;
  }

  function renderDetail() {
    const aside = libraryRoot.querySelector("#mock-library-detail");
    if (!state.selected) {
      aside.textContent = "Select a card";
      return;
    }
    const item = state.selected;
    aside.innerHTML = `<h3></h3><div class="grid grid-cols-2">
      <button class="mari-chrome-control" id="mock-edit">${SVG("pencil")} Edit Character</button>
      <button type="button" class="mari-chrome-control" id="mock-chat">${SVG("message-circle")} Chat now</button></div>`;
    aside.querySelector("h3").textContent = item.name;
    aside.querySelector("#mock-edit").addEventListener("click", () => {
      events.push({ type: "edit", id: item.id });
      showOverlay(`Character editor: ${item.name}`);
    });
    aside.querySelector("#mock-chat").addEventListener("click", () => {
      events.push({ type: "chat", id: item.id });
      showOverlay(`Start chat with ${item.name}?`);
    });
  }

  function showOverlay(text) {
    const overlay = document.createElement("div");
    overlay.className = "mock-overlay";
    overlay.setAttribute("data-mock-overlay", "");
    overlay.innerHTML = `<div><p></p><button type="button">Close</button></div>`;
    overlay.querySelector("p").textContent = text;
    overlay.querySelector("button").addEventListener("click", () => overlay.remove());
    document.body.append(overlay);
  }

  function openLibrary() {
    if (libraryRoot) return;
    events.push({ type: "open-library" });
    libraryRoot = document.createElement("div");
    libraryRoot.setAttribute("data-component", "CharacterLibraryView");
    libraryRoot.className = "mock-library";
    libraryRoot.innerHTML = `
      <div class="mari-panel-gradient--characters">
        <header class="mock-library-header">
          <div class="mock-library-header-row">
            <h2>Characters library</h2>
            <div class="grid mock-library-toolbar">
              <input class="mari-chrome-field" placeholder="Search characters" />
              <select><option>Name A-Z</option></select>
              <button type="button" id="mock-library-close">Close</button>
            </div>
          </div>
        </header>
        <div class="mock-library-body">
          <section><div id="mock-library-grid" class="mock-library-grid"></div>
            <p><span id="mock-library-count"></span> <button type="button" id="mock-library-more">Load more</button></p></section>
          <aside id="mock-library-detail">Select a card</aside>
        </div>
      </div>`;
    const input = libraryRoot.querySelector("input");
    // React reads the value on `input`; so does this mock.
    input.addEventListener("input", () => {
      state.search = input.value;
      void loadPage(true);
    });
    libraryRoot.querySelector("#mock-library-more").addEventListener("click", () => void loadPage(false));
    libraryRoot.querySelector("#mock-library-close").addEventListener("click", () => {
      libraryRoot.remove();
      libraryRoot = null;
      state = { ...state, search: "", items: [], selected: null };
    });
    document.body.append(libraryRoot);
    void loadPage(true);
  }

  window.__mockUi.openLibrary = openLibrary;
  window.__mockUi.showOverlay = showOverlay;
  addEventListener("DOMContentLoaded", () => document.querySelector("main").after(panel()));
})();
