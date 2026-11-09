// Character Manager: light editing from the details pane. Favorite toggle,
// add / remove tags on one character, and add / remove a tag on every
// character in the current results. Writes go through CLMData, which uses
// Marinara's own endpoints (bulk-tags for tags, PATCH for the favorite flag).
//
// Marinara's own lists keep showing the old data until they refetch (for
// example after reopening the library), because the extension cannot reach
// Marinara's query cache.

const CLMEdit = (() => {
  "use strict";

  let toastRoot = null;
  let refocusAddTag = false;

  /** Small notice at the bottom of the screen, optionally with one action button. */
  function toast(message, { action = null, error = false, duration = 6000 } = {}) {
    if (!toastRoot || !toastRoot.isConnected) {
      toastRoot = document.createElement("div");
      toastRoot.className = "clm-toasts";
      toastRoot.setAttribute("aria-live", "polite");
      document.body.append(toastRoot);
    }
    const node = document.createElement("div");
    node.className = `clm-toast${error ? " clm-toast--error" : ""}`;
    node.append(Object.assign(document.createElement("span"), { textContent: message }));
    if (action) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "clm-btn clm-toast-action";
      button.textContent = action.label;
      button.addEventListener("click", () => {
        node.remove();
        action.run();
      });
      node.append(button);
    }
    toastRoot.append(node);
    marinara.setTimeout(() => node.remove(), duration);
    return node;
  }

  const fail = (what, error) => {
    marinara.log.error(what, error);
    toast(`${what}: ${error.message}`, { error: true, duration: 9000 });
  };

  /** The raw spellings on this character that make up an index tag key. */
  const rawTagsFor = (card, key) => (card.item.tags ?? []).filter((tag) => CLM.normalizeTag(tag) === key);

  async function editOne(card, edit, undo) {
    try {
      const result = await CLMData.editTags([card.id], edit);
      if (result.failedIds.length) throw new Error("Marinara could not update this character");
      if (undo) toast(undo.message, { action: { label: "Undo", run: () => void CLMData.editTags([card.id], undo.edit).catch((e) => fail("Undo failed", e)) } });
    } catch (error) {
      fail("Could not change tags", error);
    }
  }

  function removeTagButton(card, key) {
    const raw = rawTagsFor(card, key);
    // With "Match variant spellings" a tag can come from Tag Merger rather than the card.
    if (!raw.length) return null;
    const label = raw[0];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "clm-chip-remove";
    button.textContent = "×";
    button.title = `Remove “${label}” from ${card.name}`;
    button.setAttribute("aria-label", button.title);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      void editOne(card, { remove: raw }, { message: `Removed “${label}” from ${card.name}.`, edit: { add: [label] } });
    });
    button.addEventListener("contextmenu", (event) => event.stopPropagation());
    return button;
  }

  function addTagField(card) {
    const { h } = CLMManager;
    const input = h("input.clm-chip-input.clm-add-tag", {
      attrs: { type: "text", placeholder: "+ tag", autocomplete: "off", spellcheck: "false", "aria-label": `Add a tag to ${card.name}`, list: "clm-all-tags" },
    });
    const wrap = h("span.clm-add-tag-wrap", {}, input);
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const typed = input.value.trim();
      if (!typed) return;
      // Reuse the library's most common spelling of an existing tag.
      const label = CLMManager.state.index.tags.get(CLM.normalizeTag(typed))?.label ?? typed;
      if ((card.item.tags ?? []).some((t) => CLM.normalizeTag(t) === CLM.normalizeTag(label))) {
        input.value = "";
        return;
      }
      input.value = "";
      refocusAddTag = true;
      void editOne(card, { add: [label] }, { message: `Added “${label}” to ${card.name}.`, edit: { remove: [label] } });
    });
    updateTagDatalist();
    if (refocusAddTag) {
      refocusAddTag = false;
      queueMicrotask(() => input.focus());
    }
    return wrap;
  }

  /** One <datalist> of every tag, rebuilt only when the tag set changes. */
  let datalistFor = null;
  function updateTagDatalist() {
    const tags = CLMManager.state.index.tags;
    if (datalistFor === tags) return;
    datalistFor = tags;
    let list = document.getElementById("clm-all-tags");
    if (!list) {
      list = document.createElement("datalist");
      list.id = "clm-all-tags";
      document.body.append(list);
    }
    const sorted = [...tags.values()].sort((a, b) => b.count - a.count).slice(0, 3000);
    list.replaceChildren(...sorted.map((t) => Object.assign(document.createElement("option"), { value: t.label })));
  }

  function favoriteButton(card) {
    const { h, icon } = CLMManager;
    const button = h(
      `button.clm-btn${card.favorite ? ".clm-on" : ""}`,
      { attrs: { type: "button", title: card.favorite ? "Remove from favorites" : "Add to favorites", "aria-pressed": String(card.favorite) } },
      icon("star"),
      card.favorite ? " Favorite" : " Favorite",
    );
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await CLMData.setFavorite(card.id, !card.favorite);
      } catch (error) {
        fail("Could not change favorite", error);
        button.disabled = false;
      }
    });
    return button;
  }

  /** Add or remove one tag on every character in `cards` (the current results). */
  async function bulkTag(cards, mode, label) {
    const tag = label.trim();
    if (!tag || !cards.length) return;
    const key = CLM.normalizeTag(tag);
    const targets =
      mode === "add"
        ? cards.filter((c) => !(c.item.tags ?? []).some((t) => CLM.normalizeTag(t) === key))
        : cards.filter((c) => (c.item.tags ?? []).some((t) => CLM.normalizeTag(t) === key));
    if (!targets.length) {
      toast(mode === "add" ? `Every result already has “${tag}”.` : `No result has “${tag}”.`);
      return;
    }
    const verb = mode === "add" ? `Add “${tag}” to` : `Remove “${tag}” from`;
    if (!window.confirm(`${verb} ${targets.length.toLocaleString()} character${targets.length === 1 ? "" : "s"}?\n\nMarinara saves a version of each card before its tags change.`)) return;
    const ids = targets.map((c) => c.id);
    const spellings = mode === "remove" ? [...new Set(targets.flatMap((c) => c.item.tags.filter((t) => CLM.normalizeTag(t) === key)))] : [];
    try {
      const result = await CLMData.editTags(ids, mode === "add" ? { add: [tag] } : { remove: spellings });
      const failed = result.failedIds.length ? `, ${result.failedIds.length} failed` : "";
      toast(`${mode === "add" ? "Added" : "Removed"} “${tag}” on ${result.updatedIds.length.toLocaleString()} characters${failed}.`, {
        error: !!result.failedIds.length,
        duration: 12000,
        action: {
          label: "Undo",
          run: () =>
            void CLMData.editTags(result.updatedIds, mode === "add" ? { remove: [tag] } : { add: [spellings[0] ?? tag] }).catch((e) => fail("Undo failed", e)),
        },
      });
    } catch (error) {
      fail("Bulk tag edit failed", error);
    }
  }

  marinara.onCleanup(() => {
    toastRoot?.remove();
    document.getElementById("clm-all-tags")?.remove();
  });

  return Object.freeze({ toast, removeTagButton, addTagField, favoriteButton, bulkTag, updateTagDatalist });
})();
