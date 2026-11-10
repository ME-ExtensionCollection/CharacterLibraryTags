// Character Manager smoke tests, run by scripts/smoke.mjs against the dev harness.
// Expected counts come from the same mock library and core.js, evaluated in Node.
import { loadCore, mockSummary } from "../test/helpers.mjs";

const CLM = loadCore();
const index = CLM.buildIndex(mockSummary(3000));
const expectCount = (patch) => CLM.filter(index, { ...CLM.emptyQuery(), ...patch }).length;

async function openManager(page) {
  await page.click("#mock-open-library", { button: "right" });
  await page.waitForSelector(".clm-card");
}

const countText = (page) => page.$eval(".clm-count", (n) => n.textContent);
async function waitCount(page, n, total = 3005) {
  const text = `${n.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`;
  // The count reads "N of M" (exact), optionally followed by a status note.
  await page.waitForFunction((t) => (document.querySelector(".clm-count")?.textContent === t || document.querySelector(".clm-count")?.textContent.startsWith(`${t} `)), text, { timeout: 5000 }).catch(async () => {
    throw new Error(`count: expected "${text}…", got "${await countText(page)}"`);
  });
}

async function addChip(page, kind, label) {
  const input = page.locator(".clm-tag-row").filter({ hasText: kind }).locator("input");
  await input.fill(label);
  await page.keyboard.press("Enter");
}

export default async function ({ withPage, assert, BASE }) {
  await withPage("manager-open", async (page, shot) => {
    // Left click keeps Marinara's own library.
    await page.click("#mock-open-library");
    await page.waitForSelector("[data-component=CharacterLibraryView]");
    assert.equal(await page.$(".clm-lock:not([hidden])"), null);
    await page.click("#mock-library-close");
    await openManager(page);
    await waitCount(page, 3005);
    const title = await page.$eval("#mock-open-library", (n) => n.title);
    assert.match(title, /right-click: Character Manager/);
    await shot("open");
    await page.keyboard.press("Escape");
    await page.waitForSelector(".clm-lock[hidden]", { state: "attached" });
    // The top bar's Characters button opens it too.
    assert.match(await page.$eval("[data-tour=panel-characters]", (n) => n.title), /right-click: Character Manager/);
    await page.click("[data-tour=panel-characters]", { button: "right" });
    await page.waitForSelector(".clm-lock:not([hidden])");
  });

  await withPage("manager-tag-rows", async (page, shot) => {
    await openManager(page);
    await addChip(page, "Mandatory", "female");
    await waitCount(page, expectCount({ mandatory: ["female"] }));
    await addChip(page, "At least one", "fantasy");
    await addChip(page, "At least one", "romance");
    await addChip(page, "Excluded", "nsfw");
    const expected = expectCount({ mandatory: ["female"], anyOf: ["fantasy", "romance"], excluded: ["nsfw"] });
    assert.ok(expected > 0 && expected < 3005);
    await waitCount(page, expected);
    // Suggestions show the library's spelling with counts.
    const input = page.locator(".clm-tag-row").filter({ hasText: "Mandatory" }).locator("input");
    await input.fill("rolepl");
    await page.waitForSelector(".clm-suggest:not([hidden]) .clm-suggest-item");
    const first = await page.$eval(".clm-suggest:not([hidden]) .clm-suggest-label", (n) => n.textContent);
    assert.equal(first, "Roleplay");
    await shot("rows");
    await input.fill("");
    // Backspace in an empty field removes the last chip.
    await input.press("Backspace");
    await waitCount(page, expectCount({ anyOf: ["fantasy", "romance"], excluded: ["nsfw"] }));
    await page.click(".clm-clear");
    await waitCount(page, 3005);
  });

  await withPage("manager-search-syntax", async (page) => {
    await openManager(page);
    await page.fill(".clm-search", "a #female -#nsfw ~fantasy ~romance ");
    const expected = expectCount({ text: "a", mandatory: ["female"], anyOf: ["fantasy", "romance"], excluded: ["nsfw"] });
    await waitCount(page, expected);
    // Finished tag tokens became chips; the box keeps the free text.
    assert.equal((await page.inputValue(".clm-search")).trim(), "a");
    assert.equal(await page.locator(".clm-chip--mandatory").count(), 1);
    assert.equal(await page.locator(".clm-tag-rows .clm-chip--any").count(), 2);
    // Search-box tag suggestions.
    await page.fill(".clm-search", 'a #"dark e');
    await page.locator(".clm-search").press("End");
    await page.waitForSelector(".clm-search-wrap .clm-suggest:not([hidden])");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => [...document.querySelectorAll(".clm-chip--mandatory")].some((n) => /dark elf/i.test(n.textContent)));
    // creator: filter and scope select
    await page.click(".clm-clear");
    await page.fill(".clm-search", "creator:kestrel");
    await waitCount(page, expectCount({ text: "creator:kestrel" }));
    await page.fill(".clm-search", "kestrel");
    await page.selectOption(".clm-scope", "name");
    await waitCount(page, expectCount({ text: "kestrel", scope: "name" }));
  });

  await withPage("manager-full-text", async (page) => {
    await openManager(page);
    await page.selectOption(".clm-scope", "all");
    await page.fill(".clm-search", "zebra lighthouse");
    await waitCount(page, 5);
    // Local filters still apply on top of the server's matches.
    await addChip(page, "Mandatory", "female");
    // Alice, Quote "Quinn" and Messy Mel ("FEMALE ").
    await waitCount(page, 3);
    const names = await page.$$eval(".clm-card .clm-card-name", (n) => n.map((x) => x.textContent).sort());
    assert.deepEqual(names, ["Alice", "Messy Mel", 'Quote "Quinn"']);
  });

  await withPage("manager-sort-and-details", async (page, shot) => {
    await openManager(page);
    for (const sort of ["tokens-desc", "tags-asc", "created-desc", "name-desc"]) {
      await page.selectOption(".clm-popup .clm-select:not(.clm-scope)", sort);
      const expected = CLM.sortCards(index.cards, sort)[0].name;
      await page.waitForFunction((name) => document.querySelector('.clm-card[data-index="0"] .clm-card-name')?.textContent === name, expected, { timeout: 3000 }).catch(() => {
        throw new Error(`sort ${sort}: first card should be ${expected}`);
      });
    }
    // Keyboard navigation and details
    await page.click('.clm-card[data-index="0"]');
    await page.keyboard.press("ArrowRight");
    const selected = await page.$eval(".clm-card--selected .clm-card-name", (n) => n.textContent);
    const second = CLM.sortCards(index.cards, "name-desc")[1].name;
    assert.equal(selected, second);
    await page.waitForSelector(".clm-drawer");
    assert.equal(await page.$eval(".clm-details-name", (n) => n.textContent), second);
    // Click a tag in the details pane: it becomes mandatory.
    const tag = await page.$eval(".clm-details-tags .clm-chip--tag .clm-chip-label", (n) => n.textContent);
    await page.click(".clm-details-tags .clm-chip--tag .clm-chip-label");
    await page.waitForFunction((t) => [...document.querySelectorAll(".clm-tag-rows .clm-chip--mandatory")].some((n) => n.textContent.includes(t)), tag);
    await shot("details");
    // Random picks something in the results.
    await page.click(".clm-btn[title='Random character']");
    await page.waitForSelector(".clm-card--selected");
  });

  await withPage("manager-edit", async (page) => {
    await openManager(page);
    await page.fill(".clm-search", "Untagged Ursula");
    await waitCount(page, 1);
    await page.click(".clm-card");
    await page.fill(".clm-add-tag", "Brand New Tag");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => [...document.querySelectorAll(".clm-details-tags .clm-chip-label")].some((n) => n.textContent === "Brand New Tag"));
    const row = await (await fetch(`${BASE}/api/characters/special-2`)).json();
    assert.deepEqual(JSON.parse(row.data).tags, ["Brand New Tag"]);
    // Remove it again from the chip.
    await page.click(".clm-details-tags .clm-chip-remove");
    await page.waitForFunction(() => !document.querySelector(".clm-details-tags .clm-chip--tag"));
    const after = await (await fetch(`${BASE}/api/characters/special-2`)).json();
    assert.deepEqual(JSON.parse(after.data).tags, []);
    // Favorite
    await page.click(".clm-details-actions .clm-btn:first-child");
    await page.waitForSelector(".clm-card--fav");
    const fav = await (await fetch(`${BASE}/api/characters/special-2`)).json();
    assert.equal(JSON.parse(fav.data).extensions.fav, true);
  });

  await withPage("manager-big-library", async (page, shot) => {
    await fetch(`${BASE}/__mock/reset?count=20000`, { method: "POST" });
    await openManager(page);
    await waitCount(page, 20005, 20005);
    const nodes = await page.locator(".clm-card").count();
    assert.ok(nodes < 400, `${nodes} card nodes rendered`);
    await page.$eval(".clm-grid", (n) => (n.scrollTop = n.scrollHeight));
    await page.waitForTimeout(300);
    const last = CLM.sortCards(CLM.buildIndex(mockSummary(20000)).cards, "name-asc").at(-1).name;
    const names = await page.$$eval(".clm-card .clm-card-name", (n) => n.map((x) => x.textContent));
    assert.ok(names.includes(last), `last card ${last} rendered after scrolling`);
    const start = Date.now();
    await page.fill(".clm-search", "ka #female ");
    await page.waitForFunction(() => !document.querySelector(".clm-count").textContent.startsWith("20,005 of"));
    assert.ok(Date.now() - start < 1500);
    await shot("big");
  });

  await withPage(
    "manager-tag-merger",
    async (page, shot) => {
      await openManager(page);
      await page.click(".clm-btn[data-toggle=showCloud]");
      await page.check(".clm-tagmerger label:first-of-type input");
      await page.waitForFunction(() => {
        const tags = [...document.querySelectorAll(".clm-cloud-tag > span:first-child")].map((n) => n.textContent);
        return tags.length > 0 && tags.length <= 14;
      });
      // Fold variants: "Elf" also finds cards tagged "Dark Elf" or "elves".
      await addChip(page, "Mandatory", "Elf");
      const plain = expectCount({ mandatory: ["elf"] });
      await waitCount(page, plain);
      await page.keyboard.press("Escape"); // close the suggestions
      await page.check(".clm-tagmerger label:nth-of-type(2) input");
      await page.waitForFunction((n) => !document.querySelector(".clm-count").textContent.startsWith(`${n} of`), plain.toLocaleString("en-US"));
      const folded = Number((await countText(page)).split(" of ")[0].replace(/,/g, ""));
      assert.ok(folded > plain, `fold variants: ${folded} > ${plain}`);
      await shot("tagmerger");
    },
    { query: "?ctm=1" },
  );

  await withPage("manager-no-tag-merger", async (page) => {
    await openManager(page);
    assert.equal(await page.isDisabled(".clm-tagmerger label:first-of-type input"), true);
  });

  await withPage("manager-bridge-dom", async (page) => {
    await openManager(page);
    await page.fill(".clm-search", "Alice in Chains");
    await waitCount(page, 1);
    await page.click('.clm-card[data-index="0"]');
    await page.click(".clm-details-actions button:has-text('Edit')");
    await page.waitForSelector("[data-mock-overlay]");
    assert.equal(await page.isHidden(".clm-lock"), true);
    const events = await page.evaluate(() => window.__mockUi.events);
    assert.deepEqual(events.map((e) => e.type), ["open-library", "edit"]);
    assert.equal(events[1].id, "special-1");
    // "Back to manager" restores the same search.
    await page.click("[data-mock-overlay] button");
    await page.click(".clm-toast-action");
    await page.waitForSelector(".clm-lock:not([hidden])");
    assert.equal(await page.inputValue(".clm-search"), "Alice in Chains");
    // Chat: double-click opens the editor, the Chat button the start-chat dialog.
    await page.click(".clm-details-actions button:has-text('Chat')");
    await page.waitForFunction(() => window.__mockUi.events.some((e) => e.type === "chat"));
  });

  await withPage(
    "manager-bridge-store",
    async (page) => {
      await openManager(page);
      await page.fill(".clm-search", "Alice in Chains");
      await waitCount(page, 1);
      await page.dblclick('.clm-card[data-index="0"]');
      await page.waitForSelector("[data-mock-overlay]");
      let events = await page.evaluate(() => window.__mockUi.events);
      assert.deepEqual(events, [{ type: "store-edit", id: "special-1" }]);
      await page.click("[data-mock-overlay] button");
      await page.click(".clm-toast-action");
      await page.click(".clm-details-actions button:has-text('Chat')");
      await page.waitForFunction(() => window.__mockUi.events.some((e) => e.type === "store-modal"));
      events = await page.evaluate(() => window.__mockUi.events);
      assert.deepEqual(events.at(-1), { type: "store-modal", modal: "start-character-chat", characterId: "special-1", characterName: "Alice in Chains" });
      // Edits refresh Marinara's character queries.
      await page.click("[data-mock-overlay] button");
      await page.click("#mock-open-library", { button: "right" });
      await page.fill(".clm-add-tag", "Rock");
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => window.__mockUi.events.some((e) => e.type === "invalidate"));
      events = await page.evaluate(() => window.__mockUi.events);
      assert.deepEqual(events.find((e) => e.type === "invalidate").queryKey, ["characters"]);
    },
    { query: "?react=1" },
  );

  await withPage(
    "manager-bridge-actions",
    async (page) => {
      await openManager(page);
      await page.fill(".clm-search", "Alice in Chains");
      await waitCount(page, 1);
      await page.click('.clm-card[data-index="0"]');
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => window.__mockUi.events.some((e) => e.type === "store-edit"));
    },
    { query: "?react=actions" },
  );

  await withPage("manager-bulk-and-library-button", async (page) => {
    page.on("dialog", (dialog) => dialog.accept());
    // The grid button in the stock library opens the manager too.
    await page.click("#mock-open-library");
    await page.click(".clt-manager");
    await page.waitForSelector(".clm-card");
    await page.fill(".clm-search", "creator:kestrel");
    const expected = expectCount({ text: "creator:kestrel" });
    await waitCount(page, expected);
    await page.click(".clm-btn[data-toggle=showAdvanced]");
    await page.fill(".clm-bulk-tag", "Kestrel Pick");
    await page.click(".clm-bulk button:has-text('Add tag')");
    await page.waitForSelector(".clm-toast");
    const tagged = async () => {
      const [, body] = [null, await (await fetch(`${BASE}/api/characters/catalog?view=summary`)).json()];
      return body.items.filter((i) => i.tags.includes("Kestrel Pick")).length;
    };
    assert.equal(await tagged(), expected);
    await page.fill(".clm-search", "");
    await addChip(page, "Mandatory", "Kestrel Pick");
    await waitCount(page, expected);
    await page.click(".clm-bulk button:has-text('Remove tag')");
    await page.waitForFunction(() => document.querySelectorAll(".clm-toast").length >= 2);
    assert.equal(await tagged(), 0);
  });

  await withPage("manager-saved-searches", async (page) => {
    page.on("dialog", (dialog) => dialog.accept("Female elves"));
    await page.evaluate(() => window.__clmHarness.resetStorage());
    await openManager(page);
    await addChip(page, "Mandatory", "female");
    await addChip(page, "At least one", "elf");
    await page.click(".clm-btn[data-toggle=showAdvanced]");
    await page.fill(".clm-advanced .clm-number >> nth=0", "5");
    const expected = expectCount({ mandatory: ["female"], anyOf: ["elf"], tagCount: { min: 5, max: null } });
    await waitCount(page, expected);
    await page.selectOption(".clm-presets", "save");
    await page.waitForFunction(() => [...document.querySelectorAll(".clm-presets option")].some((o) => o.textContent === "Female elves"));
    await page.click(".clm-clear");
    await waitCount(page, 3005);
    assert.equal(await page.inputValue(".clm-advanced .clm-number >> nth=0"), "");
    await page.selectOption(".clm-presets", "load:0");
    await waitCount(page, expected);
    assert.equal(await page.inputValue(".clm-advanced .clm-number >> nth=0"), "5");
    // Saved searches survive a reload.
    await page.reload();
    await page.waitForSelector("#mock-open-library");
    await openManager(page);
    await page.selectOption(".clm-presets", "load:0");
    await waitCount(page, expected);
    await page.selectOption(".clm-presets", "delete:0");
    await page.waitForFunction(() => ![...document.querySelectorAll(".clm-presets option")].some((o) => o.textContent === "Female elves"));
  });

  const folderMembers = async (id) => {
    const row = await (await fetch(`${BASE}/api/characters/groups/${id}`)).json();
    return JSON.parse(row.characterIds);
  };

  await withPage("manager-folders", async (page) => {
    page.on("dialog", (dialog) => dialog.accept("Smoke folder"));
    await openManager(page);
    // Filter by folder; ids of deleted characters do not count.
    await page.selectOption(".clm-folder-filter", "folder-fantasy");
    const members = (await folderMembers("folder-fantasy")).filter((id) => index.byId.has(id));
    await waitCount(page, members.length);
    await page.selectOption(".clm-folder-filter", "none");
    const inSome = new Set([...(await folderMembers("folder-fantasy")), ...(await folderMembers("folder-favs"))]);
    await waitCount(page, index.cards.filter((c) => !inSome.has(c.id)).length);
    await page.selectOption(".clm-folder-filter", "");
    await page.fill(".clm-search", "folder:weekend");
    await waitCount(page, (await folderMembers("folder-favs")).length);
    await page.click(".clm-clear");
    await waitCount(page, 3005);

    // Multi-select: click, Ctrl-click, Shift-click range.
    await page.click('.clm-card[data-index="0"]');
    await page.click('.clm-card[data-index="2"]', { modifiers: ["Control"] });
    await page.click('.clm-card[data-index="5"]', { modifiers: ["Shift"] });
    assert.match(await page.textContent(".clm-selbar-count"), /^5 selected/);
    const picked = await page.$$eval(".clm-card--checked", (n) => n.map((x) => x.dataset.id));
    assert.equal(picked.length, 5);

    // Add the selection to a folder, then undo.
    const before = await folderMembers("folder-empty");
    assert.deepEqual(before, []);
    await page.selectOption(".clm-selbar .clm-folder-picker >> nth=0", "folder-empty");
    await page.waitForSelector(".clm-toast:has-text('Empty folder')");
    assert.deepEqual((await folderMembers("folder-empty")).sort(), [...picked].sort());
    await page.waitForFunction(() => document.querySelector(".clm-folder-filter").textContent.includes("Empty folder (5)"));
    await page.click(".clm-toast:has-text('Empty folder') .clm-toast-action");
    await page.waitForFunction(() => document.querySelector(".clm-folder-filter").textContent.includes("Empty folder (0)"));
    assert.deepEqual(await folderMembers("folder-empty"), []);

    // New folder from the selection.
    await page.selectOption(".clm-selbar .clm-folder-picker >> nth=0", "__new");
    await page.waitForFunction(() => document.querySelector(".clm-folder-filter").textContent.includes("Smoke folder (5)"));

    // Tag only the selection.
    await page.fill(".clm-selbar .clm-bulk-tag", "Picked");
    await page.click(".clm-selbar button:has-text('Add')");
    await page.waitForSelector(".clm-toast:has-text('Picked')");
    const summary = await (await fetch(`${BASE}/api/characters/catalog?view=summary`)).json();
    assert.deepEqual(summary.items.filter((i) => i.tags.includes("Picked")).map((i) => i.id).sort(), [...picked].sort());

    // While some are selected, a plain click anywhere on a card adds or removes it.
    await page.click('.clm-card[data-index="6"] .clm-card-name');
    assert.match(await page.textContent(".clm-selbar-count"), /^6 selected/);
    assert.equal(await page.isVisible('.clm-card--checked[data-index="6"]'), true);
    await page.click('.clm-card[data-index="6"]', { position: { x: 4, y: 4 } });
    assert.match(await page.textContent(".clm-selbar-count"), /^5 selected/);
    // Esc clears the selection; then a plain click shows one character again.
    await page.keyboard.press("Escape");
    assert.equal(await page.isHidden(".clm-selbar"), true);
    await page.click('.clm-card[data-index="1"]');
    assert.equal(await page.isHidden(".clm-selbar"), true);
    // Details pane: folder chip × removes it from the folder.
    await page.click('.clm-card[data-index="0"]');
    await page.waitForSelector(".clm-details-folders .clm-chip--folder:has-text('Smoke folder')");
    await page.click(".clm-details-folders .clm-chip--folder:has-text('Smoke folder') .clm-chip-remove");
    await page.waitForFunction(() => document.querySelector(".clm-folder-filter").textContent.includes("Smoke folder (4)"));
  });

  await withPage("manager-delete", async (page, shot) => {
    // Native dialogs must not appear any more.
    page.on("dialog", (dialog) => {
      throw new Error(`unexpected ${dialog.type()}: ${dialog.message()}`);
    });
    const exists = async (id) => (await fetch(`${BASE}/api/characters/${id}`)).status === 200;
    await openManager(page);

    // One character from the details pane: Cancel and Esc keep it, Delete deletes it.
    await page.click('.clm-card[data-index="0"]');
    const first = await page.getAttribute('.clm-card[data-index="0"]', "data-id");
    const firstName = await page.textContent(".clm-details-name");
    await page.click(".clm-details-actions .clm-btn--danger");
    await page.waitForSelector(".clm-dialog");
    assert.equal(await page.textContent(".clm-dialog-title"), `Delete “${firstName}”?`);
    assert.equal(await page.$$eval(".clm-dialog-char", (n) => n.length), 1);
    assert.equal(await page.$(".clm-dialog-typed"), null);
    await shot("dialog-one");
    await page.click(".clm-dialog-cancel");
    assert.equal(await page.$(".clm-dialog"), null);
    await page.click(".clm-details-actions .clm-btn--danger");
    await page.keyboard.press("Escape");
    assert.equal(await page.$(".clm-dialog"), null);
    // Esc closed only the dialog, not the manager.
    assert.equal(await page.isVisible(".clm-popup"), true);
    assert.equal(await exists(first), true);
    await page.click(".clm-details-actions .clm-btn--danger");
    await page.click(".clm-dialog-confirm");
    await page.waitForSelector(".clm-toast:has-text('Deleted “')");
    assert.equal(await exists(first), false);
    await waitCount(page, 3004, 3004);
    assert.equal(await page.isHidden(".clm-details"), true);

    // Twelve selected: the confirm button waits for the typed count.
    await page.click('.clm-card[data-index="0"]');
    await page.click('.clm-card[data-index="11"]', { modifiers: ["Shift"] });
    assert.match(await page.textContent(".clm-selbar-count"), /^12 selected/);
    const picked = await page.$$eval(".clm-card--checked", (n) => n.map((x) => x.dataset.id));
    await page.click(".clm-selbar .clm-btn--danger");
    await page.waitForSelector(".clm-dialog-typed");
    assert.equal(await page.textContent(".clm-dialog-title"), "Delete 12 characters?");
    assert.equal(await page.$$eval(".clm-dialog-char", (n) => n.length), 12);
    assert.equal(await page.isDisabled(".clm-dialog-confirm"), true);
    await page.fill(".clm-dialog-typed", "11");
    assert.equal(await page.isDisabled(".clm-dialog-confirm"), true);
    await page.keyboard.press("Enter");
    assert.notEqual(await page.$(".clm-dialog"), null);
    await page.fill(".clm-dialog-typed", "12");
    assert.equal(await page.isDisabled(".clm-dialog-confirm"), false);
    await shot("dialog-many");
    for (const id of picked) assert.equal(await exists(id), true);
    await page.keyboard.press("Enter");
    await page.waitForSelector(".clm-toast:has-text('Deleted 12 characters')");
    for (const id of picked) assert.equal(await exists(id), false);
    await waitCount(page, 2992, 2992);
    assert.equal(await page.isHidden(".clm-selbar"), true);
    const stats = await (await fetch(`${BASE}/__mock/stats`)).json();
    assert.ok(stats.maxDeletesInFlight === 2, `in flight: ${stats.maxDeletesInFlight}`);
  });

  await withPage("manager-delete-dropped-connection", async (page) => {
    // Two delete requests fail at the network level: the extension retries them.
    let aborted = 0;
    await page.route("**/api/characters/*", (route) => {
      if (route.request().method() === "DELETE" && aborted < 2) {
        aborted += 1;
        return route.abort("connectionreset");
      }
      return route.continue();
    });
    // Delete 2 goes through on the server but the answer is lost: the retry's 404 counts as done.
    await fetch(`${BASE}/__mock/reset?dropDeletes=2,3,4`, { method: "POST" });
    await openManager(page);
    await page.click('.clm-card[data-index="0"]');
    await page.click('.clm-card[data-index="3"]', { modifiers: ["Shift"] });
    const picked = await page.$$eval(".clm-card--checked", (n) => n.map((x) => x.dataset.id));
    await page.click(".clm-selbar .clm-btn--danger");
    await page.click(".clm-dialog-confirm");
    await page.waitForSelector(".clm-toast:has-text('retrying')");
    await page.waitForSelector(".clm-toast:has-text('Deleted 4 characters')", { timeout: 30000 });
    assert.equal(await page.$(".clm-toast--error"), null);
    assert.equal(aborted, 2);
    for (const id of picked) assert.equal((await fetch(`${BASE}/api/characters/${id}`)).status, 404);
  }, { allowErrors: /ERR_EMPTY_RESPONSE|ERR_CONNECTION_RESET|Failed to load resource|404/ });

  await withPage("manager-delete-rate-limit", async (page) => {
    // Marinara-style 429s: the run waits, retries and still deletes everything.
    await fetch(`${BASE}/__mock/reset?deleteLimit=2`, { method: "POST" });
    await openManager(page);
    await page.click('.clm-card[data-index="0"]');
    await page.click('.clm-card[data-index="9"]', { modifiers: ["Shift"] });
    const picked = await page.$$eval(".clm-card--checked", (n) => n.map((x) => x.dataset.id));
    await page.click(".clm-selbar .clm-btn--danger");
    await page.fill(".clm-dialog-typed", "10");
    await page.click(".clm-dialog-confirm");
    await page.waitForSelector(".clm-toast:has-text('slow down')");
    await page.waitForSelector(".clm-toast:has-text('Deleted 10 characters')", { timeout: 20000 });
    assert.equal(await page.$(".clm-toast--error"), null);
    for (const id of picked) assert.equal((await fetch(`${BASE}/api/characters/${id}`)).status, 404);
    const stats = await (await fetch(`${BASE}/__mock/stats`)).json();
    assert.ok(stats.rateLimited > 0);
    assert.equal(stats.deletes, 10);
  }, { allowErrors: /status of 429/ });

  await withPage("manager-delete-append", async (page, shot) => {
    // A second delete while one runs joins it: one notice, one total, all gone.
    const exists = async (id) => (await fetch(`${BASE}/api/characters/${id}`)).status === 200;
    await openManager(page);
    await page.click('.clm-card[data-index="0"]');
    await page.click('.clm-card[data-index="11"]', { modifiers: ["Shift"] });
    const first = await page.$$eval(".clm-card--checked", (n) => n.map((x) => x.dataset.id));
    await page.click(".clm-selbar .clm-btn--danger");
    await page.fill(".clm-dialog-typed", "12");
    await page.click(".clm-dialog-confirm");
    await page.waitForSelector(".clm-toast:has-text('Deleting')");
    await page.focus(".clm-grid");
    await page.keyboard.press("Escape"); // clear the selection
    await page.waitForSelector(".clm-selbar", { state: "hidden" });
    const more = await page.$$eval(".clm-card", (cards) =>
      cards.filter((c) => Number(c.dataset.index) >= 20 && Number(c.dataset.index) < 23).map((c) => c.dataset.id));
    const click = (id, init = {}) => page.$eval(`.clm-card[data-id="${id}"]`, (n, init) => n.dispatchEvent(new MouseEvent("click", { bubbles: true, ...init })), init);
    await click(more[0]);
    await click(more[2], { shiftKey: true });
    assert.match(await page.textContent(".clm-selbar-count"), /^3 selected/);
    await page.click(".clm-selbar .clm-btn--danger");
    await page.waitForSelector(".clm-dialog:has-text('these join it')");
    await shot("join");
    await page.click(".clm-dialog-confirm");
    await page.waitForSelector(".clm-toast:has-text('of 15')");
    await page.waitForSelector(".clm-toast:has-text('Deleted 15 characters')", { timeout: 20000 });
    for (const id of [...first, ...more]) assert.equal(await exists(id), false, id);
    await waitCount(page, 2990, 2990);
    const stats = await (await fetch(`${BASE}/__mock/stats`)).json();
    assert.equal(stats.deletes, 15);
  });

  await withPage("manager-source-link", async (page, shot) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
    await openManager(page);
    const open = async (name) => {
      await page.fill(".clm-search", `"${name}"`);
      await page.click('.clm-card[data-index="0"]');
      await page.waitForFunction((n) => document.querySelector(".clm-details-name")?.textContent === n, name);
      await page.waitForSelector(".clm-details-source:not([hidden])");
    };
    await open("Alice");
    const href = () => page.$$eval(".clm-source-link", (n) => n.map((a) => a.href));
    assert.deepEqual(await href(), ["https://chub.ai/characters/kestrel/alice-1234"]);
    assert.equal(await page.getAttribute(".clm-source-link", "target"), "_blank");
    await page.click(".clm-source-copy");
    await page.waitForSelector(".clm-toast:has-text('Link copied')");
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "https://chub.ai/characters/kestrel/alice-1234");
    await shot("source");
    await open("Alice in Chains");
    assert.deepEqual(await href(), ["https://chub.ai/characters/q/alice-in-chains"]);
    await open("Messy Mel");
    assert.deepEqual(await href(), ["https://example.com/cards/messy-mel"]);
    await open("Untagged Ursula");
    assert.deepEqual(await href(), ["https://botbooru.com/character/31337"]);
    assert.match(await page.textContent(".clm-details-source"), /Open on Botbooru/);
    // Generated cards have no source.
    await page.fill(".clm-search", "");
    await page.click('.clm-card[data-id^="mock-"] >> nth=0');
    await page.waitForFunction(() => document.querySelector(".clm-details-source:not([hidden])")?.textContent.includes("No download link saved"));
    assert.deepEqual(await href(), []);
    assert.match(await page.textContent(".clm-details-source"), /No download link saved/);
  });

  await withPage("manager-search-clear", async (page, shot) => {
    await openManager(page);
    assert.equal(await page.isHidden(".clm-search-clear"), true);
    await page.fill(".clm-search", "kestrel elf");
    const expected = expectCount({ text: "kestrel elf" });
    await waitCount(page, expected);
    assert.equal(await page.isVisible(".clm-search-clear"), true);
    await shot("x");
    await page.click(".clm-search-clear");
    await waitCount(page, 3005);
    assert.equal(await page.inputValue(".clm-search"), "");
    assert.equal(await page.isHidden(".clm-search-clear"), true);
    // Focus stays in the box; Ctrl+Z restores the text and the filter.
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("clm-search")), true);
    await page.keyboard.press("Control+z");
    await waitCount(page, expected);
    assert.equal(await page.inputValue(".clm-search"), "kestrel elf");
    assert.equal(await page.isVisible(".clm-search-clear"), true);
  });

  await withPage("manager-details-keeps-place", async (page, shot) => {
    await openManager(page);
    // Big cards, scrolled into the middle of the library.
    await page.$eval(".clm-width", (n) => {
      n.value = n.max;
      n.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.$eval(".clm-grid", (n) => (n.scrollTop = n.scrollHeight / 2));
    await page.waitForTimeout(300);
    const columns = () => page.$$eval(".clm-card", (cards) => new Set(cards.map((c) => c.style.transform.match(/\(([-\d.]+)px/)[1])).size);
    const top = (id) => page.$eval(`.clm-card[data-id="${id}"]`, (n) => Math.round(n.getBoundingClientRect().top));
    // Fewer columns means wider, taller cards: the card keeps its top unless it
    // would then hang off the bottom, in which case it rises just enough to fit.
    const expectedTop = (id, wanted) =>
      page.$eval(`.clm-card[data-id="${id}"]`, (n, wanted) => {
        const grid = n.closest(".clm-grid");
        const viewTop = grid.getBoundingClientRect().top;
        const gap = 10; // the grid leaves one gap of room under the card
        return Math.round(Math.max(viewTop, Math.min(wanted, viewTop + grid.clientHeight - gap - n.getBoundingClientRect().height)));
      }, wanted);
    // The rightmost card fully in view (it has to change column when the grid narrows).
    const { id, x, y } = await page.$eval(".clm-grid", (grid) => {
      const view = grid.getBoundingClientRect();
      const inView = [...grid.querySelectorAll(".clm-card")].filter((c) => {
        const r = c.getBoundingClientRect();
        return r.top >= view.top && r.bottom <= view.bottom;
      });
      const card = inView.reduce((a, b) => (b.getBoundingClientRect().left > a.getBoundingClientRect().left ? b : a));
      const r = card.getBoundingClientRect();
      return { id: card.dataset.id, x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    const before = await top(id);
    const columnsBefore = await columns();
    // Click in place: page.click() would scroll the card into view first.
    await page.mouse.click(x, y);
    await page.waitForSelector(".clm-details:not([hidden])");
    await page.waitForTimeout(400);
    assert.ok((await columns()) < columnsBefore, "details pane should take columns");
    const opened = await expectedTop(id, before);
    assert.ok(Math.abs((await top(id)) - opened) <= 1, `opened card at ${await top(id)}, expected ${opened}`);
    await shot("open");
    // Closing reflows back around the card just viewed.
    await page.click(".clm-details-close");
    await page.waitForTimeout(400);
    assert.ok(Math.abs((await top(id)) - opened) <= 1, `card moved on close from ${opened} to ${await top(id)}`);
  });

  await withPage("manager-clear-keeps-place", async (page, shot) => {
    await openManager(page);
    // The first card of the top row in view, and how far that row is from the grid's top.
    const topCard = () =>
      page.$eval(".clm-grid", (grid) => {
        const view = grid.getBoundingClientRect();
        const cards = [...grid.querySelectorAll(".clm-card")].filter((c) => c.getBoundingClientRect().bottom > view.top + 10);
        const card = cards.reduce((a, b) => (Number(b.dataset.index) < Number(a.dataset.index) ? b : a));
        return { id: card.dataset.id, index: Number(card.dataset.index), offset: Math.round(card.getBoundingClientRect().top - view.top) };
      });
    await page.$eval(".clm-grid", (n) => (n.scrollTop = n.scrollHeight / 3));
    await page.waitForTimeout(200);
    const start = await topCard();
    assert.ok(start.index > 100);

    // Filter: back to the top of the (short) filtered list.
    await page.fill(".clm-search", "kestrel");
    await waitCount(page, expectCount({ text: "kestrel" }));
    assert.equal((await topCard()).index, 0);
    // Clear: back to the same card at the same height.
    await page.click(".clm-clear");
    await waitCount(page, 3005);
    await page.waitForTimeout(100);
    assert.deepEqual(await topCard(), start);

    // Filter by the top card's creator, delete every match (the top card too), clear:
    // you land on the first surviving card after it.
    const lineup = await page.$$eval(".clm-card", (cards) => cards.map((c) => [Number(c.dataset.index), c.dataset.id]).sort((a, b) => a[0] - b[0]).map((x) => x[1]));
    // Element click (no scrolling into view): the top card may be partly above the fold.
    await page.$eval(`.clm-card[data-id="${start.id}"]`, (n) => n.click());
    await page.click("button[title='Show everything by this creator']");
    await page.waitForFunction(() => !document.querySelector(".clm-count")?.textContent.startsWith("3,005 "));
    // Narrow to a handful (same creator, same first name word) so every match is on screen.
    const word = (await page.textContent(".clm-details-name")).split(/\s+/)[0];
    await page.fill(".clm-search", `${await page.inputValue(".clm-search")} ${word}`);
    await page.waitForFunction(() => /^\d{1,2} of /.test(document.querySelector(".clm-count")?.textContent ?? ""));
    await page.focus(".clm-grid");
    await page.keyboard.press("Control+a");
    const doomed = await page.$$eval(".clm-card--checked", (n) => n.map((x) => x.dataset.id));
    assert.ok(doomed.includes(start.id));
    await page.click(".clm-selbar .clm-btn--danger");
    await page.waitForSelector(".clm-dialog");
    if (await page.$(".clm-dialog-typed")) await page.fill(".clm-dialog-typed", String(doomed.length));
    await page.click(".clm-dialog-confirm");
    await page.waitForSelector(".clm-toast:has-text('Deleted')");
    await page.click(".clm-clear");
    const left = 3005 - doomed.length;
    await waitCount(page, left, left);
    await page.waitForTimeout(100);
    const survivor = lineup.slice(lineup.indexOf(start.id)).find((id) => !doomed.includes(id));
    await shot("after");
    // The details pane closing (its card was deleted) reflows the columns too, so
    // demand "on screen", not the exact row.
    const onScreen = await page.$eval(`.clm-card[data-id="${survivor}"]`, (n) => {
      const view = n.closest(".clm-grid").getBoundingClientRect();
      const r = n.getBoundingClientRect();
      return r.bottom > view.top && r.top < view.bottom;
    }).catch(() => false);
    assert.ok(onScreen, `${survivor} (next after the deleted top card) not on screen`);
  });

  await withPage("manager-triage", async (page, shot) => {
    await openManager(page);
    const log = () => page.evaluate(() => window.__triageLog);
    // Every badge on screen shows its card's band (blank when unscored).
    const badges = () =>
      page.$$eval(".clm-card", (cards) => {
        const scores = window.marinaraCharTriage.scores();
        return cards.map((c) => {
          const s = scores.get(c.dataset.id);
          return [c.querySelector(".clm-card-score").textContent, s === undefined ? "" : String(Math.min(5, 1 + Math.floor(s * 5)))];
        });
      });
    const shown = await badges();
    assert.ok(shown.some(([, want]) => want === "") && shown.some(([, want]) => want === "5"));
    for (const [got, want] of shown) assert.equal(got, want);
    // Triage button opens Char Triage's panel.
    await page.click(".clm-triage");
    assert.equal(await page.evaluate(() => window.__triage.opened), 1);

    // score: filter, counted the same way as core.js.
    const scores = await page.evaluate(() => Object.fromEntries(window.marinaraCharTriage.scores()));
    const ids = await page.evaluate(async () => (await (await fetch("/api/characters/catalog?view=summary")).json()).items.map((i) => i.id));
    const inBand5 = ids.filter((id) => id in scores && Math.min(5, 1 + Math.floor(scores[id] * 5)) === 5).length;
    await page.fill(".clm-search", "score:5");
    await waitCount(page, inBand5);
    await page.fill(".clm-search", "");
    await waitCount(page, 3005);

    // Likely disliked first: band 5 on top. New scores wait for the button.
    await page.selectOption("select[aria-label='Sort order']", "dislike-desc");
    await page.waitForFunction(() => document.querySelector('.clm-card[data-index="0"] .clm-card-score')?.textContent === "5");
    const firstBefore = await page.getAttribute('.clm-card[data-index="0"]', "data-id");
    await page.evaluate(() => window.__triage.retrain(3));
    await page.waitForSelector(".clm-scores-pending:not([hidden])");
    assert.equal(await page.getAttribute('.clm-card[data-index="0"]', "data-id"), firstBefore);
    await shot("pending");
    await page.click(".clm-scores-pending");
    await page.waitForSelector(".clm-scores-pending", { state: "hidden" });
    await page.waitForFunction((before) => document.querySelector('.clm-card[data-index="0"]')?.dataset.id !== before, firstBefore);
    // Back to a normal sort: new scores just apply.
    await page.selectOption("select[aria-label='Sort order']", "created-desc");
    await page.evaluate(() => window.__triage.retrain(0));
    await page.waitForFunction(() => {
      const scores = window.marinaraCharTriage.scores();
      return [...document.querySelectorAll(".clm-card")].every((c) => {
        const s = scores.get(c.dataset.id);
        return c.querySelector(".clm-card-score").textContent === (s === undefined ? "" : String(Math.min(5, 1 + Math.floor(s * 5))));
      });
    });
    assert.equal(await page.isHidden(".clm-scores-pending"), true);

    // Keep from the details pane.
    await page.click('.clm-card[data-index="0"]');
    const keptId = await page.getAttribute('.clm-card[data-index="0"]', "data-id");
    await page.click(".clm-details-actions .clm-keep");
    await page.waitForSelector(".clm-details-actions .clm-keep:has-text('Kept')");
    // Keep from the selection bar.
    await page.click('.clm-card[data-index="2"]', { modifiers: ["Control"] });
    await page.click('.clm-card[data-index="3"]', { modifiers: ["Control"] });
    await page.click(".clm-selbar-keep");
    await page.waitForSelector(".clm-toast:has-text('as fine for Char Triage')");
    const keeps = (await log()).filter((d) => d.decision === "keep").map((d) => d.id);
    assert.equal(keeps[0], keptId);
    assert.equal(keeps.length, 4); // card 0 (details), then 0, 2, 3 (selection started from the open card)

    // Delete dialog: everything "for the picture" by default, one unticked.
    await page.click('.clm-card[data-index="5"]');
    await page.click('.clm-card[data-index="7"]', { modifiers: ["Shift"] });
    const picked = await page.$$eval(".clm-card--checked", (n) => n.map((x) => x.dataset.id).sort());
    await page.click(".clm-selbar .clm-btn--danger");
    await page.waitForSelector(".clm-dialog-learn-all");
    assert.equal(await page.isChecked(".clm-dialog-learn-all"), true);
    await page.uncheck(`.clm-dialog-char[data-id="${picked[1]}"] .clm-dialog-learn`);
    assert.equal(await page.evaluate(() => document.querySelector(".clm-dialog-learn-all").indeterminate), true);
    await shot("dialog");
    await page.click(".clm-dialog-confirm");
    await page.waitForSelector(".clm-toast:has-text('Deleted 3 characters')");
    const deletes = (await log()).filter((d) => d.decision === "delete");
    assert.deepEqual(deletes.map((d) => [d.id, d.learn, d.isItem]).sort(), picked.map((id, i) => [id, i !== 1, true]));

    // Opened but not decided: a weak keep when the manager closes.
    await page.click('.clm-card[data-index="20"]');
    const viewed = await page.getAttribute('.clm-card[data-index="20"]', "data-id");
    await page.click(".clm-close");
    const implied = (await log()).filter((d) => d.decision === "implied-keep").map((d) => d.id);
    assert.ok(implied.includes(viewed));
    assert.ok(!implied.includes(keptId), "already kept explicitly");
    assert.ok(!picked.some((id) => implied.includes(id)), "deleted cards are not kept");
  }, { query: "?ctr=1" });

  await withPage("manager-without-triage", async (page) => {
    await openManager(page);
    assert.equal(await page.isHidden(".clm-triage"), true);
    await page.click('.clm-card[data-index="0"]');
    assert.equal(await page.$(".clm-details-actions .clm-keep"), null);
    // Without Char Triage a score term matches nothing.
    await page.fill(".clm-search", "score:5");
    await waitCount(page, 0);
    await page.fill(".clm-search", "");
    await page.click('.clm-card[data-index="1"]', { modifiers: ["Control"] });
    await page.click(".clm-selbar .clm-btn--danger");
    await page.waitForSelector(".clm-dialog");
    assert.equal(await page.$(".clm-dialog-learn-all"), null);
    assert.equal(await page.$(".clm-dialog-learn"), null);
    assert.equal(await page.isHidden(".clm-selbar-keep"), true);
  });
}
