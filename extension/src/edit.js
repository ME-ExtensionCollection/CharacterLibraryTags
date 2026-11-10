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
        if (!action.keep) node.remove();
        action.run(button);
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
      toast(mode === "add" ? `They all have “${tag}” already.` : `None of them have “${tag}”.`);
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

  // ── Folders ──

  const names = (cards) => (cards.length === 1 ? cards[0].name : `${cards.length.toLocaleString()} characters`);

  async function addToFolder(folder, cards) {
    const ids = cards.map((c) => c.id);
    try {
      const { before, changed } = await CLMData.editFolder(folder.id, { add: ids });
      if (!changed) return toast(`Already in “${folder.name}”.`);
      const added = ids.filter((id) => !before.includes(id));
      toast(`Added ${names(cards.filter((c) => added.includes(c.id)))} to “${folder.name}”.`, {
        action: { label: "Undo", run: () => void CLMData.editFolder(folder.id, { remove: added }).catch((e) => fail("Undo failed", e)) },
      });
    } catch (error) {
      fail("Could not change the folder", error);
    }
  }

  async function removeFromFolder(folder, cards) {
    const ids = cards.map((c) => c.id);
    try {
      const { before, changed } = await CLMData.editFolder(folder.id, { remove: ids });
      if (!changed) return toast(`Not in “${folder.name}”.`);
      const removed = ids.filter((id) => before.includes(id));
      toast(`Removed ${names(cards.filter((c) => removed.includes(c.id)))} from “${folder.name}”.`, {
        action: { label: "Undo", run: () => void CLMData.editFolder(folder.id, { add: removed }).catch((e) => fail("Undo failed", e)) },
      });
    } catch (error) {
      fail("Could not change the folder", error);
    }
  }

  async function newFolder(cards) {
    const name = window.prompt(`New folder for ${names(cards)}:`, "")?.trim();
    if (!name) return;
    try {
      await CLMData.createFolder(name, cards.map((c) => c.id));
      toast(`Created “${name}” with ${names(cards)}.`);
    } catch (error) {
      fail("Could not create the folder", error);
    }
  }

  /**
   * A select that files `cards` into a folder (mode "add", with "New folder…")
   * or takes them out of one (mode "remove", only folders that hold some of them).
   */
  function folderPicker(cards, { label, mode = "add" }) {
    const { h } = CLMManager;
    const folders = CLMManager.state.index.folders;
    const ids = new Set(cards.map((c) => c.id));
    const holding = (f) => (f.characterIds ?? []).filter((id) => ids.has(id)).length;
    const choices = mode === "add" ? folders : folders.filter((f) => holding(f) > 0);
    const select = h("select.clm-select.clm-folder-picker", { attrs: { "aria-label": label, title: label } });
    select.append(h("option", { text: label, value: "" }));
    for (const f of choices) {
      const n = holding(f);
      const note = cards.length > 1 && n ? ` (${n} of ${cards.length} in it)` : mode === "add" && n ? " (already in)" : "";
      select.append(h("option", { text: `${f.name}${note}`, value: f.id }));
    }
    if (mode === "add") select.append(h("option", { text: "New folder…", value: "__new" }));
    select.disabled = mode === "remove" && choices.length === 0;
    select.addEventListener("change", () => {
      const value = select.value;
      select.value = "";
      if (value === "__new") return void newFolder(cards);
      const folder = folders.find((f) => f.id === value);
      if (!folder) return;
      void (mode === "add" ? addToFolder(folder, cards) : removeFromFolder(folder, cards));
    });
    return select;
  }

  function removeFromFolderButton(folder, cards) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "clm-chip-remove";
    button.textContent = "×";
    button.title = `Remove from “${folder.name}”`;
    button.setAttribute("aria-label", button.title);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      void removeFromFolder(folder, cards);
    });
    return button;
  }

  // ── Delete ──

  let deleting = false;

  /**
   * A confirm dialog drawn inside the manager window. Resolves true on confirm,
   * false on Cancel, Esc or a click outside. With `typed`, the confirm button
   * stays disabled until that exact text is typed.
   */
  function confirmDialog({ title, body = [], confirmLabel = "OK", danger = false, typed = null }) {
    const { h, icon } = CLMManager;
    const host = CLMManager.popup ?? document.body;
    const previousFocus = document.activeElement;
    return new Promise((resolve) => {
      const cancel = h("button.clm-btn.clm-dialog-cancel", { text: "Cancel", attrs: { type: "button" } });
      const confirm = h(
        `button.clm-btn.clm-dialog-confirm${danger ? ".clm-btn--danger-solid" : ".clm-on"}`,
        { attrs: { type: "button" } },
        danger ? icon("trash") : null,
        ` ${confirmLabel}`,
      );
      let input = null;
      let typedBlock = null;
      if (typed !== null) {
        input = h("input.clm-input.clm-dialog-typed", {
          attrs: { type: "text", inputmode: "numeric", autocomplete: "off", spellcheck: "false", "aria-label": `Type ${typed} to confirm` },
        });
        typedBlock = h("label.clm-dialog-typed-row", {}, h("span", {}, "Type ", h("strong", { text: typed }), " to confirm"), input);
        const sync = () => (confirm.disabled = input.value.replace(/[\s,.]/g, "") !== typed.replace(/[\s,.]/g, ""));
        input.addEventListener("input", sync);
        sync();
      }
      const titleId = `clm-dialog-${Date.now().toString(36)}`;
      const dialog = h(
        `div.clm-dialog${danger ? ".clm-dialog--danger" : ""}`,
        { attrs: { role: "alertdialog", "aria-modal": "true", "aria-labelledby": titleId } },
        h("h2.clm-dialog-title", { text: title, attrs: { id: titleId } }),
        ...body,
        typedBlock,
        h("div.clm-dialog-actions", {}, cancel, confirm),
      );
      const backdrop = h("div.clm-dialog-backdrop", {}, dialog);
      const finish = (value) => {
        backdrop.remove();
        if (previousFocus?.isConnected) previousFocus.focus();
        resolve(value);
      };
      cancel.addEventListener("click", () => finish(false));
      confirm.addEventListener("click", () => !confirm.disabled && finish(true));
      backdrop.addEventListener("pointerdown", (event) => {
        if (event.target === backdrop) finish(false);
      });
      backdrop.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          finish(false);
        } else if (event.key === "Enter" && event.target === input) {
          event.preventDefault();
          if (!confirm.disabled) finish(true);
        } else if (event.key === "Tab") {
          // Keep focus inside the dialog.
          const focusable = [...dialog.querySelectorAll("button:not(:disabled), input")];
          const at = focusable.indexOf(document.activeElement);
          const next = event.shiftKey ? (at <= 0 ? focusable.length - 1 : at - 1) : at === focusable.length - 1 ? 0 : at + 1;
          event.preventDefault();
          focusable[next]?.focus();
        }
        event.stopPropagation();
      });
      host.append(backdrop);
      (input ?? cancel).focus();
    });
  }

  const LIST_LIMIT = 200;

  /** Scrollable list of characters (avatar, name, creator) for a dialog. */
  function characterList(cards) {
    const { h } = CLMManager;
    const rows = cards.slice(0, LIST_LIMIT).map((c) =>
      h(
        "li.clm-dialog-char",
        {},
        c.item.avatarPath
          ? h("img.clm-dialog-avatar", { attrs: { src: c.item.avatarPath, alt: "", loading: "lazy", draggable: "false" } })
          : h("span.clm-dialog-avatar.clm-dialog-avatar--empty", { text: (c.name || "?").slice(0, 1).toUpperCase() }),
        h("span.clm-dialog-char-name", { text: c.name || "Unnamed" }),
        c.creator ? h("span.clm-muted", { text: `by ${c.creator}` }) : null,
      ),
    );
    if (cards.length > LIST_LIMIT) rows.push(h("li.clm-dialog-more.clm-muted", { text: `…and ${(cards.length - LIST_LIMIT).toLocaleString()} more` }));
    return h("ul.clm-dialog-list", {}, ...rows);
  }

  /**
   * Permanently delete `cards` after asking in a dialog that lists them.
   * From 10 up, the count must be typed too. Runs one request at a time
   * with a progress notice and a Stop button.
   */
  async function deleteCards(cards, { confirmed = false } = {}) {
    if (deleting) return toast("A delete is already running.");
    const { h, icon } = CLMManager;
    const protectedCards = cards.filter((c) => CLMData.isProtected(c.id));
    const targets = cards.filter((c) => !CLMData.isProtected(c.id));
    if (!targets.length) return toast(`${names(protectedCards)} is built into Marinara and cannot be deleted.`);
    const n = targets.length;
    const ok = confirmed || await confirmDialog({
      title: n === 1 ? `Delete “${targets[0].name}”?` : `Delete ${n.toLocaleString()} characters?`,
      danger: true,
      confirmLabel: n === 1 ? "Delete" : `Delete ${n.toLocaleString()}`,
      typed: n >= 10 ? String(n) : null,
      body: [
        characterList(targets),
        h(
          "div.clm-dialog-warning",
          {},
          icon("alert"),
          h(
            "div",
            {},
            h("strong", { text: "This can't be undone." }),
            " Marinara has no trash. It also removes them from their chats and deletes their gallery images; the chats themselves stay.",
          ),
        ),
        protectedCards.length ? h("p.clm-muted", { text: `${names(protectedCards)} is built in and will be skipped.` }) : null,
      ],
    });
    if (!ok) return;

    deleting = true;
    let stop = false;
    const notice = toast(`Deleting 0 of ${n.toLocaleString()}…`, {
      duration: 24 * 60 * 60 * 1000,
      action: {
        label: "Stop",
        keep: true,
        run: (button) => {
          stop = true;
          button.disabled = true;
          button.textContent = "Stopping…";
        },
      },
    });
    const text = notice.firstChild;
    // The notice ticks every second, so a slow server still shows the run is alive.
    const started = Date.now();
    let done = 0;
    let status = "";
    const clock = () => {
      const seconds = Math.floor((Date.now() - started) / 1000);
      return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    };
    const paint = () => (text.textContent = `Deleting ${done.toLocaleString()} of ${n.toLocaleString()}… ${clock()}${status ? ` · ${status}` : ""}`);
    let ticking = true;
    const tick = () => {
      if (!ticking) return;
      paint();
      marinara.setTimeout(tick, 1000);
    };
    tick();
    try {
      const result = await CLMData.deleteCharacters(
        targets.map((c) => c.id),
        {
          shouldStop: () => stop,
          onProgress: (count) => {
            done = count;
            status = "";
            paint();
          },
          onWait: (seconds) => {
            status = `Marinara asked to slow down, waiting ${seconds} s`;
            paint();
          },
          onRetry: () => {
            status = "connection dropped, retrying";
            paint();
          },
        },
      );
      ticking = false;
      notice.remove();
      const deleted = result.deletedIds.length;
      const parts = [`Deleted ${deleted === 1 && n === 1 ? `“${targets[0].name}”` : `${deleted.toLocaleString()} character${deleted === 1 ? "" : "s"}`} in ${clock()}.`];
      if (stop && deleted + result.failed.length < n) parts.push(`Stopped; ${(n - deleted - result.failed.length).toLocaleString()} not deleted.`);
      const failedCards = result.failed.map(({ id }) => targets.find((c) => c.id === id)).filter(Boolean);
      if (result.failed.length) {
        parts.push(`${result.failed.length.toLocaleString()} failed: ${result.failed[0].error.message}`);
        for (const { id, error } of result.failed) marinara.log.error(`Could not delete ${id}`, error);
      }
      toast(parts.join(" "), {
        error: !!result.failed.length,
        duration: result.failed.length ? 60000 : 12000,
        // They were confirmed already; Retry deletes just the ones that failed.
        action: failedCards.length ? { label: "Retry", run: () => void deleteCards(failedCards, { confirmed: true }) } : null,
      });
    } catch (error) {
      ticking = false;
      notice.remove();
      fail("Delete failed", error);
    } finally {
      ticking = false;
      deleting = false;
    }
  }

  function deleteButton(cards, { label = " Delete" } = {}) {
    const { h, icon } = CLMManager;
    return h(
      "button.clm-btn.clm-btn--danger",
      {
        attrs: { type: "button", title: cards.length === 1 ? `Permanently delete ${cards[0].name}` : "Permanently delete the selected characters" },
        on: { click: () => void deleteCards(cards) },
      },
      icon("trash"),
      label,
    );
  }

  marinara.onCleanup(() => {
    toastRoot?.remove();
    document.getElementById("clm-all-tags")?.remove();
  });

  return Object.freeze({ toast, removeTagButton, addTagField, favoriteButton, bulkTag, updateTagDatalist, folderPicker, removeFromFolderButton, deleteCards, deleteButton, confirmDialog });
})();
