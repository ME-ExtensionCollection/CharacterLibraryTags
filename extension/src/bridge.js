// Character Manager: launcher and the bridge into Marinara's own UI.
//
// Launcher: right-clicking Marinara's "Open Library" button in the Characters
// panel opens the manager (left click keeps Marinara's behaviour).
//
// Edit / Chat use Marinara's own UI store actions, the same ones its library,
// sidebar and chat call: openCharacterDetail(id) opens the full-screen
// editor, openModal("start-character-chat", …) the start-chat dialog.
// Marinara does not publish its store to page code, so it is found in this
// order:
//   1. globalThis.__MARINARA_HOST__ (present when a capability package loaded)
//   2. React's fiber tree: zustand's useStore keeps [store, selector] as
//      useCallback dependencies, so any mounted component that reads the UI
//      store leads to it. The QueryClientProvider's `client` prop is found in
//      the same walk and used to refresh Marinara's character lists after
//      the manager edits tags or favorites.
//   3. If neither works, drive the stock Character Library: open it, search
//      for the character, select its card and click Edit / "Chat now".

const CLMBridge = (() => {
  "use strict";

  // packages/client/src/components/panels/CharactersPanel.tsx
  const LIBRARY_ACTIONS = '[data-component="CharacterLibraryActions"]';
  // packages/client/src/components/characters/CharacterLibraryView.tsx
  const LIBRARY_ROOT = '[data-component="CharacterLibraryView"]';
  const MAX_FIBERS = 300000;
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;

  // ── Finding Marinara's store and query client ──

  let cached = { ui: null, queryClient: null };

  const isUiStore = (api) => {
    try {
      if (!api || typeof api.getState !== "function" || typeof api.subscribe !== "function") return false;
      const state = api.getState();
      return !!state && typeof state.openCharacterDetail === "function" && typeof state.openModal === "function";
    } catch {
      return false;
    }
  };
  const isQueryClient = (client) =>
    !!client && typeof client.invalidateQueries === "function" && typeof client.getQueryCache === "function";

  function reactRootFiber() {
    const candidates = [document.getElementById("root"), ...document.body.children];
    for (const node of candidates) {
      if (!node) continue;
      const key = Object.keys(node).find((k) => k.startsWith("__reactContainer$"));
      if (key && node[key]) return node[key];
    }
    return null;
  }

  function scanFibers() {
    const found = { ui: null, queryClient: null };
    const root = reactRootFiber();
    if (!root) return found;
    const stack = [root];
    let seen = 0;
    while (stack.length && seen < MAX_FIBERS && !(found.ui && found.queryClient)) {
      const fiber = stack.pop();
      seen += 1;
      if (!found.queryClient && isQueryClient(fiber.memoizedProps?.client)) found.queryClient = fiber.memoizedProps.client;
      // Function components keep their hooks as a linked list on memoizedState.
      if (!found.ui && typeof fiber.type !== "string") {
        let hook = fiber.memoizedState;
        let guard = 0;
        while (hook && typeof hook === "object" && "next" in hook && guard < 200) {
          const value = hook.memoizedState;
          // useCallback(() => selector(api.getState()), [api, selector])
          const store = Array.isArray(value) && Array.isArray(value[1]) ? value[1].find(isUiStore) : null;
          if (store) {
            found.ui = store;
            break;
          }
          hook = hook.next;
          guard += 1;
        }
      }
      if (fiber.sibling) stack.push(fiber.sibling);
      if (fiber.child) stack.push(fiber.child);
    }
    return found;
  }

  /** { ui, queryClient }, either may be null. */
  function host() {
    const published = globalThis.__MARINARA_HOST__;
    if (!isUiStore(cached.ui) && isUiStore(published?.stores?.ui)) cached.ui = published.stores.ui;
    if (!isQueryClient(cached.queryClient) && isQueryClient(published?.queryClient)) cached.queryClient = published.queryClient;
    if (!isUiStore(cached.ui) || !isQueryClient(cached.queryClient)) {
      try {
        const found = scanFibers();
        if (!isUiStore(cached.ui)) cached.ui = found.ui;
        if (!isQueryClient(cached.queryClient)) cached.queryClient = found.queryClient;
      } catch (error) {
        marinara.log.debug("Could not inspect Marinara's component tree", error);
      }
    }
    return cached;
  }

  /** Ask Marinara to refetch its character lists (after the manager wrote something). */
  function refreshMarinaraLists() {
    const { queryClient } = host();
    if (!queryClient) return false;
    try {
      void queryClient.invalidateQueries({ queryKey: ["characters"] });
      return true;
    } catch (error) {
      marinara.log.debug("Could not refresh Marinara's character lists", error);
      return false;
    }
  }
  CLMData.onWrite(refreshMarinaraLists);

  // ── DOM fallback through the stock library ──

  function findLibraryButton(scope = document) {
    for (const button of scope.querySelectorAll(`${LIBRARY_ACTIONS} button`)) {
      if (button.querySelector('svg[class*="lucide-users"]')) return button;
    }
    return null;
  }

  function waitFor(read, timeout) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        let value = null;
        try {
          value = read();
        } catch {
          value = null;
        }
        if (value) return resolve(value);
        if (Date.now() - started > timeout) return reject(new Error("timed out"));
        marinara.setTimeout(tick, 60);
      };
      tick();
    });
  }

  const visible = (node) => !!node && node.getClientRects().length > 0;

  function detailButton(root, kind) {
    const icon = kind === "edit" ? "lucide-pencil" : "lucide-message-circle";
    const buttons = [...root.querySelectorAll(`button svg[class*="${icon}"]`)].map((svg) => svg.closest("button"));
    return buttons.find(visible) ?? null;
  }

  async function viaLibrary(item, kind) {
    let root = document.querySelector(LIBRARY_ROOT);
    if (!root) {
      const button = findLibraryButton();
      if (!button) throw new Error("Open the Characters panel first, so the library can be reached.");
      button.click();
      root = await waitFor(() => document.querySelector(LIBRARY_ROOT), 5000);
    }
    const input = root.querySelector("input.mari-chrome-field");
    if (!input) throw new Error("The library's search box was not found.");
    nativeSetter.call(input, item.name);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const card = await waitFor(() => root.querySelector(`[data-card-library-card="${CSS.escape(item.id)}"]`), 8000);
    card.click();
    const button = await waitFor(() => detailButton(root, kind), 4000);
    button.click();
  }

  // ── Actions ──

  function backToManager(message) {
    CLMEdit.toast(message, { action: { label: "Back to manager", run: () => CLMManager.show() }, duration: 8000 });
  }

  async function run(item, kind) {
    if (!item) return;
    const { ui } = host();
    CLMManager.hide();
    try {
      if (ui) {
        const state = ui.getState();
        if (kind === "edit") state.openCharacterDetail(item.id);
        else state.openModal("start-character-chat", { characterId: item.id, characterName: item.name });
      } else {
        await viaLibrary(item, kind);
      }
      if (kind === "edit") backToManager(`Editing ${item.name}.`);
    } catch (error) {
      marinara.log.warn(`Character Manager could not open ${kind === "edit" ? "the editor" : "a chat"}`, error);
      CLMEdit.toast(
        `Could not ${kind === "edit" ? "open the editor" : "start a chat"} for ${item.name}: ${error.message}`,
        { error: true, duration: 9000, action: { label: "Back to manager", run: () => CLMManager.show() } },
      );
    }
  }

  const edit = (item) => run(item, "edit");
  const chat = (item) => run(item, "chat");

  // ── Launcher ──

  function onContextMenu(event) {
    const actions = event.target.closest?.(LIBRARY_ACTIONS);
    if (!actions) return;
    const button = event.target.closest("button");
    if (!button || button !== findLibraryButton(actions)) return;
    event.preventDefault();
    event.stopPropagation();
    void CLMManager.open();
  }
  document.addEventListener("contextmenu", onContextMenu, true);

  // Hint on the stock button so the right-click is discoverable.
  const HINT = " (right-click: Character Manager)";
  function markLauncher() {
    const button = findLibraryButton();
    if (button && !button.title.endsWith(HINT)) button.title = `${button.title}${HINT}`;
  }
  let hintFrame = 0;
  const hintObserver = new MutationObserver(() => {
    if (!hintFrame) hintFrame = requestAnimationFrame(() => ((hintFrame = 0), markLauncher()));
  });
  hintObserver.observe(document.body, { childList: true, subtree: true });
  markLauncher();

  marinara.onCleanup(() => {
    document.removeEventListener("contextmenu", onContextMenu, true);
    hintObserver.disconnect();
    if (hintFrame) cancelAnimationFrame(hintFrame);
    cached = { ui: null, queryClient: null };
  });

  return Object.freeze({ edit, chat, findLibraryButton, refreshMarinaraLists, host });
})();
