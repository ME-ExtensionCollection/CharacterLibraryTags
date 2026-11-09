// Character Manager: launcher and the bridge into Marinara's own UI.
//
// Launcher: right-clicking Marinara's "Open Library" button in the Characters
// panel opens the manager (left click keeps Marinara's behaviour).
//
// Edit / Chat: Marinara exposes no global way to open its character editor
// or start-chat dialog, so the bridge drives the stock Character Library:
// it opens the library, searches for the character, selects its card and
// clicks the detail card's Edit or "Chat now" button.

const CLMBridge = (() => {
  "use strict";

  // packages/client/src/components/panels/CharactersPanel.tsx
  const LIBRARY_ACTIONS = '[data-component="CharacterLibraryActions"]';

  /** Marinara's "Open Library" button, if the Characters panel is showing. */
  function findLibraryButton(scope = document) {
    for (const button of scope.querySelectorAll(`${LIBRARY_ACTIONS} button`)) {
      if (button.querySelector('svg[class*="lucide-users"]')) return button;
    }
    return null;
  }

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

  async function edit(item) {
    if (!item) return;
    CLMEdit.toast("Opening the editor is not wired up yet.");
  }

  async function chat(item) {
    if (!item) return;
    CLMEdit.toast("Starting a chat is not wired up yet.");
  }

  marinara.onCleanup(() => {
    document.removeEventListener("contextmenu", onContextMenu, true);
    hintObserver.disconnect();
    if (hintFrame) cancelAnimationFrame(hintFrame);
  });

  return Object.freeze({ edit, chat, findLibraryButton });
})();
