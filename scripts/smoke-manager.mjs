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

    // Esc clears the selection; a plain click selects one character again.
    await page.click('.clm-card[data-index="1"]');
    assert.equal(await page.isHidden(".clm-selbar"), true);
    // Details pane: folder chip × removes it from the folder.
    await page.click('.clm-card[data-index="0"]');
    await page.waitForSelector(".clm-details-folders .clm-chip--folder:has-text('Smoke folder')");
    await page.click(".clm-details-folders .clm-chip--folder:has-text('Smoke folder') .clm-chip-remove");
    await page.waitForFunction(() => document.querySelector(".clm-folder-filter").textContent.includes("Smoke folder (4)"));
  });

  await withPage("manager-delete", async (page, shot) => {
    const answers = [];
    const seen = [];
    page.on("dialog", (dialog) => {
      seen.push({ type: dialog.type(), message: dialog.message() });
      const answer = answers.shift();
      if (answer === false) return dialog.dismiss();
      return dialog.type() === "prompt" ? dialog.accept(String(answer ?? "")) : dialog.accept();
    });
    const exists = async (id) => (await fetch(`${BASE}/api/characters/${id}`)).status === 200;
    await openManager(page);

    // One character from the details pane: cancel keeps it, OK deletes it.
    await page.click('.clm-card[data-index="0"]');
    const first = await page.getAttribute('.clm-card[data-index="0"]', "data-id");
    answers.push(false);
    await page.click(".clm-details-actions .clm-btn--danger");
    assert.equal(await exists(first), true);
    assert.match(seen[0].message, /Permanently delete “/);
    answers.push(true);
    await page.click(".clm-details-actions .clm-btn--danger");
    await page.waitForSelector(".clm-toast:has-text('Deleted “')");
    assert.equal(await exists(first), false);
    await waitCount(page, 3004, 3004);
    assert.equal(await page.isHidden(".clm-details"), true);

    // Twelve selected: wrong typed number deletes nothing, the right one deletes all.
    await page.click('.clm-card[data-index="0"]');
    await page.click('.clm-card[data-index="11"]', { modifiers: ["Shift"] });
    assert.match(await page.textContent(".clm-selbar-count"), /^12 selected/);
    const picked = await page.$$eval(".clm-card--checked", (n) => n.map((x) => x.dataset.id));
    answers.push(true, "11");
    await page.click(".clm-selbar .clm-btn--danger");
    await page.waitForSelector(".clm-toast:has-text('did not match')");
    assert.equal(seen.at(-1).type, "prompt");
    assert.match(seen.at(-2).message, /these 12 characters/);
    for (const id of picked) assert.equal(await exists(id), true);
    answers.push(true, "12");
    await page.click(".clm-selbar .clm-btn--danger");
    await page.waitForSelector(".clm-toast:has-text('Deleted 12 characters')");
    for (const id of picked) assert.equal(await exists(id), false);
    await waitCount(page, 2992, 2992);
    assert.equal(await page.isHidden(".clm-selbar"), true);
    await shot("manager-delete");
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
}
