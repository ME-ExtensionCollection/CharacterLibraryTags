// Fake React root for the harness, enabled with ?react=1. Mimics the parts of
// React 19 + zustand 5 + TanStack Query that bridge.js reads:
//   #root.__reactContainer$… -> HostRoot fiber
//   QueryClientProvider fiber with memoizedProps.client
//   a component fiber whose hook list holds useCallback's [fn, [store, selector]]
(() => {
  if (!new URLSearchParams(location.search).has("react")) return;
  const events = window.__mockUi.events;
  const uiState = {
    openCharacterDetail(id) {
      events.push({ type: "store-edit", id });
      window.__mockUi.showOverlay(`Character editor (store): ${id}`);
    },
    openModal(type, props) {
      events.push({ type: "store-modal", modal: type, ...props });
      window.__mockUi.showOverlay(`Start chat with ${props?.characterName}? (store)`);
    },
  };
  const uiStore = { getState: () => uiState, subscribe: () => () => {}, setState() {} };
  const queryClient = {
    invalidateQueries(filters) {
      events.push({ type: "invalidate", queryKey: filters?.queryKey });
      return Promise.resolve();
    },
    getQueryCache: () => ({}),
  };
  const selector = (s) => s.openModal;
  // ?react=actions: only the selected action functions are on the hooks (no store in deps).
  const actionsOnly = new URLSearchParams(location.search).get("react") === "actions";
  const hooks = actionsOnly
    ? { memoizedState: uiState.openCharacterDetail, next: { memoizedState: uiState.openModal, next: null } }
    : { memoizedState: false, next: { memoizedState: [() => selector(uiState), [uiStore, selector]], next: null } };
  const component = { type: function CharactersPanel() {}, memoizedProps: {}, memoizedState: hooks, child: null, sibling: null };
  const provider = { type: function QueryClientProvider() {}, memoizedProps: { client: queryClient }, memoizedState: null, child: component, sibling: null };
  const hostRoot = { type: null, memoizedProps: null, memoizedState: { element: null }, child: provider, sibling: null };
  const root = document.createElement("div");
  root.id = "root";
  root["__reactContainer$mock"] = hostRoot;
  document.addEventListener("DOMContentLoaded", () => document.body.prepend(root));
})();
