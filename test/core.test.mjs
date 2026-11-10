import assert from "node:assert/strict";
import { test } from "node:test";
import { loadCore, mockSummary, tinyCatalog } from "./helpers.mjs";

const CLM = loadCore();
const index = CLM.buildIndex(tinyCatalog());
const ids = (cards) => cards.map((c) => c.id).sort();
const run = (patch, extra) => ids(CLM.filter(index, { ...CLM.emptyQuery(), ...patch }, extra));

test("index merges tag spellings and picks the most common label", () => {
  const female = index.tags.get("female");
  assert.equal(female.count, 4);
  assert.equal(female.label, "Female");
  assert.equal(index.byId.get("c").tagCount, 0);
  assert.equal(index.byId.get("f").tagKeys.has("female"), true);
});

test("empty query matches everything", () => {
  assert.deepEqual(run({}), ["a", "b", "c", "d", "e", "f"]);
});

test("mandatory tags are all-of", () => {
  assert.deepEqual(run({ mandatory: ["female"] }), ["a", "d", "e", "f"]);
  assert.deepEqual(run({ mandatory: ["female", "fantasy"] }), ["a", "f"]);
  assert.deepEqual(run({ mandatory: ["female", "missing"] }), []);
});

test("any-of tags need at least one", () => {
  assert.deepEqual(run({ anyOf: ["elf", "dark elf"] }), ["a", "d", "e"]);
});

test("excluded tags remove cards", () => {
  assert.deepEqual(run({ excluded: ["nsfw", "male"] }), ["a", "c", "e", "f"]);
});

test("mandatory, any-of and excluded combine", () => {
  assert.deepEqual(run({ mandatory: ["female"], anyOf: ["elf", "dark elf"], excluded: ["nsfw"] }), ["a", "e"]);
});

test("text scopes", () => {
  assert.deepEqual(run({ text: "alice" }), ["a", "e"]);
  assert.deepEqual(run({ text: "kestrel", scope: "name" }), []);
  assert.deepEqual(run({ text: "kestrel", scope: "creator" }), ["a", "d", "f"]);
  assert.deepEqual(run({ text: "elf", scope: "tags" }), ["a", "d", "e"]);
  // "any" covers name, creator and tags; every word must match somewhere.
  assert.deepEqual(run({ text: "kestrel elf" }), ["a", "d"]);
  assert.deepEqual(run({ text: "dark -dana" }), ["e"]);
  assert.deepEqual(run({ text: '"alice two"' }), ["e"]);
  // NFKC + case-insensitive, accents kept.
  assert.deepEqual(run({ text: "ÉLO" }), ["f"]);
});

test("tag syntax in the search box filters without chips", () => {
  assert.deepEqual(run({ text: "#female -#nsfw ~elf ~fantasy" }), ["a", "f"]);
  assert.deepEqual(run({ text: 'tag:"dark elf"' }), ["d", "e"]);
  assert.deepEqual(run({ text: 'creator:"kestrel works"' }), ["f"]);
  assert.deepEqual(run({ text: "-creator:kestrel" }), ["b", "c", "e"]);
});

test("lone syntax characters while typing do not filter", () => {
  assert.deepEqual(run({ text: "-" }), ["a", "b", "c", "d", "e", "f"]);
  assert.deepEqual(run({ text: "#" }), ["a", "b", "c", "d", "e", "f"]);
  assert.deepEqual(run({ text: 'tag:"' }), ["a", "b", "c", "d", "e", "f"]);
});

test("scope all uses server ids for words, local tags still apply", () => {
  const serverIds = new Set(["a", "b", "d"]);
  assert.deepEqual(run({ text: "zebra", scope: "all", mandatory: ["female"] }, { serverIds }), ["a", "d"]);
  // While the request is pending, words match locally.
  assert.deepEqual(run({ text: "alice", scope: "all" }, { serverIds: null }), ["a", "e"]);
  assert.deepEqual(CLM.serverTerms({ ...CLM.emptyQuery(), text: "zebra #elf light house", scope: "all" }), ["zebra", "light", "house"]);
  assert.deepEqual(CLM.serverTerms({ ...CLM.emptyQuery(), text: "zebra" }), []);
});

test("numeric and date ranges, favorites, untagged", () => {
  assert.deepEqual(run({ favoritesOnly: true }), ["a", "e"]);
  assert.deepEqual(run({ untaggedOnly: true }), ["c"]);
  assert.deepEqual(run({ tagCount: { min: 3, max: null } }), ["a", "d", "e", "f"]);
  assert.deepEqual(run({ tagCount: { min: null, max: 2 } }), ["b", "c"]);
  assert.deepEqual(run({ tokens: { min: 1000, max: 2500 } }), ["b", "e", "f"]);
  assert.deepEqual(run({ created: { from: Date.parse("2026-01-03"), to: Date.parse("2026-01-05") } }), ["c", "d", "e"]);
});

test("takeTagTokens turns finished tag tokens into chips", () => {
  assert.deepEqual(CLM.takeTagTokens("alice #elf ", false), { chips: [{ kind: "mandatory", label: "elf" }], rest: "alice " });
  // Unfinished token stays in the box until Enter.
  assert.deepEqual(CLM.takeTagTokens("alice #el", false), { chips: [], rest: "alice #el" });
  assert.deepEqual(CLM.takeTagTokens("alice #el", true), { chips: [{ kind: "mandatory", label: "el" }], rest: "alice " });
  assert.deepEqual(CLM.takeTagTokens('-tag:"dark elf" ~"sci-fi" bob', true), {
    chips: [
      { kind: "excluded", label: "dark elf" },
      { kind: "anyOf", label: "sci-fi" },
    ],
    rest: "bob",
  });
  // An unclosed quote is still being typed, even on Enter.
  assert.deepEqual(CLM.takeTagTokens('#"dark el', true), { chips: [], rest: '#"dark el' });
  assert.equal(CLM.quoteToken("#", "Dark Elf"), '#"Dark Elf"');
  assert.equal(CLM.quoteToken("#", "Elf"), "#Elf");
});

test("sorts are stable and complete", () => {
  const order = (sort, seed) => CLM.sortCards(index.cards, sort, seed).map((c) => c.id);
  assert.deepEqual(order("name-asc"), ["a", "e", "b", "c", "d", "f"]);
  assert.deepEqual(order("name-desc"), ["f", "d", "c", "b", "e", "a"]);
  assert.deepEqual(order("tags-asc"), ["c", "b", "a", "e", "d", "f"]);
  assert.deepEqual(order("tags-desc").slice(-2), ["b", "c"]);
  assert.deepEqual(order("created-desc"), ["f", "e", "d", "c", "b", "a"]);
  assert.deepEqual(order("updated-desc")[0], "a");
  assert.deepEqual(order("tokens-desc"), ["d", "b", "f", "e", "a", "c"]);
  assert.deepEqual(order("creator-asc"), ["e", "a", "d", "f", "b", "c"]);
  assert.deepEqual(order("favorites").slice(0, 2), ["a", "e"]);
  assert.deepEqual(order("random", 7), order("random", 7));
  assert.notDeepEqual(order("random", 7), order("random", 8));
  for (const sort of Object.keys(CLM.SORTS)) assert.equal(order(sort).length, 6, sort);
});

test("facets and suggestions follow the current results", () => {
  const results = CLM.filter(index, { ...CLM.emptyQuery(), mandatory: ["female"] });
  const facets = CLM.facetCounts(results);
  assert.equal(facets.get("female"), 4);
  assert.equal(facets.get("male"), undefined);
  const suggestions = CLM.suggestTags(index.tags, "a", { facets, taken: new Set(["female"]) });
  // Tags present in the results come first, then by matching count.
  assert.deepEqual(
    suggestions.map((s) => s.label),
    ["Dark Elf", "Fantasy", "Romance", "Male"],
  );
  assert.equal(suggestions.find((s) => s.label === "Male").matching, 0);
  assert.deepEqual(
    CLM.suggestTags(index.tags, "#el").map((s) => s.label),
    ["Elf", "Dark Elf"],
  );
  assert.deepEqual(
    CLM.suggestTags(index.tags, "", { visible: (k) => k === "nsfw" }).map((s) => s.label),
    ["NSFW"],
  );
  const top = CLM.topTags(index.tags, facets, { exclude: new Set(["female"]), limit: 2 });
  assert.deepEqual(top.map((t) => [t.label, t.matching]), [["Dark Elf", 2], ["Fantasy", 2]]);
});

test("Tag Merger expansion folds variants and adds implications", () => {
  const expand = new Map([
    ["dark elf", ["Dark Elf", "Elf"]],
    ["female", ["Female"]],
  ]);
  const folded = CLM.buildIndex(tinyCatalog(), { expand });
  const q = { ...CLM.emptyQuery(), mandatory: ["elf"] };
  assert.deepEqual(ids(CLM.filter(folded, q)), ["a", "d", "e"]);
  assert.equal(folded.tags.get("female").label, "Female");
});

test("active filter count", () => {
  assert.equal(CLM.activeFilterCount(CLM.emptyQuery()), 0);
  assert.equal(
    CLM.activeFilterCount({ ...CLM.emptyQuery(), text: "a #b", mandatory: ["x"], favoritesOnly: true, tokens: { min: 1, max: null } }),
    4,
  );
});

test("filters 20,000 mock cards quickly", () => {
  const big = CLM.buildIndex(mockSummary(20000));
  assert.equal(big.cards.length, 20005);
  const query = { ...CLM.emptyQuery(), text: "a", mandatory: ["female"], anyOf: ["fantasy", "romance", "nsfw"], excluded: ["male"] };
  CLM.filter(big, query); // warm up
  const start = performance.now();
  const rounds = 10;
  let results;
  for (let i = 0; i < rounds; i++) results = CLM.filter(big, query);
  const each = (performance.now() - start) / rounds;
  assert.ok(results.length > 0);
  assert.ok(each < 30, `filter took ${each.toFixed(1)} ms`);
  const sortStart = performance.now();
  CLM.sortCards(results, "name-asc");
  CLM.facetCounts(results);
  assert.ok(performance.now() - sortStart < 100);
});

test("folders: filter, folder: syntax and counts", () => {
  const folders = [
    { id: "f1", name: "Fantasy Crew", characterIds: ["a", "f", "ghost"] },
    { id: "f2", name: "Sci-Fi", characterIds: ["b", "a"] },
  ];
  const withFolders = CLM.buildIndex(tinyCatalog(), { folders });
  const q = (patch) => ids(CLM.filter(withFolders, { ...CLM.emptyQuery(), ...patch }));
  assert.deepEqual(withFolders.byId.get("a").folderIds, ["f1", "f2"]);
  assert.deepEqual(q({ folder: "f1" }), ["a", "f"]);
  assert.deepEqual(q({ folder: "some" }), ["a", "b", "f"]);
  assert.deepEqual(q({ folder: "none" }), ["c", "d", "e"]);
  assert.deepEqual(q({ text: "folder:crew" }), ["a", "f"]);
  assert.deepEqual(q({ text: 'folder:"sci-fi" -folder:crew' }), ["b"]);
  // Deleted characters in a folder do not count.
  assert.equal(withFolders.folderById.get("f1").count, 2);
  assert.deepEqual(withFolders.folders.map((f) => f.name), ["Fantasy Crew", "Sci-Fi"]);
  assert.equal(CLM.activeFilterCount({ ...CLM.emptyQuery(), folder: "none" }), 1);
});

test("source links from Bot Browser, Chub and V3 source fields", () => {
  assert.deepEqual(CLM.sourceLinks({ name: "Alice", extensions: { botBrowserSource: "chub:kestrel/alice-12", chub: { id: "kestrel/alice-12" } } }), [
    { label: "Chub", url: "https://chub.ai/characters/kestrel/alice-12" },
  ]);
  assert.deepEqual(CLM.sourceLinks({ name: "Dark Elf Dana", extensions: { botBrowserSource: "janny:abc-1" } }), [
    { label: "JannyAI", url: "https://jannyai.com/characters/abc-1_character-dark-elf-dana" },
  ]);
  assert.deepEqual(CLM.sourceLinks({ extensions: { chub: { full_path: "someone/bot" } } }), [{ label: "Chub", url: "https://chub.ai/characters/someone/bot" }]);
  assert.deepEqual(CLM.sourceLinks({ extensions: { wyvern: { id: "w1" } } }), [{ label: "Wyvern", url: "https://app.wyvern.chat/characters/w1" }]);
  assert.deepEqual(CLM.sourceLinks({ source: ["https://www.example.com/c/1", "javascript:alert(1)", "not a url"], extensions: {} }), [
    { label: "example.com", url: "https://www.example.com/c/1" },
  ]);
  // Char Importer and Botbooru markers.
  assert.deepEqual(
    CLM.sourceLinks({ extensions: { char_importer: { source_url: "https://botbooru.com/download/png/42" }, botbooru: { post_id: 42, full_path: "uploader/42" } } }),
    [{ label: "Botbooru", url: "https://botbooru.com/character/42" }],
  );
  assert.deepEqual(CLM.sourceLinks({ extensions: { botbooru: { post_id: "7" } } }), [{ label: "Botbooru", url: "https://botbooru.com/character/7" }]);
  assert.deepEqual(
    CLM.sourceLinks({ extensions: { char_importer: { source_url: "https://www.chub.ai/characters/someone/bot/" }, chub: { full_path: "someone/bot" } } }),
    [{ label: "Chub", url: "https://www.chub.ai/characters/someone/bot/" }],
  );
  // Unknown sites and empty cards give nothing.
  assert.deepEqual(CLM.sourceLinks({ extensions: { botBrowserSource: "plotlight:x" } }), []);
  assert.deepEqual(CLM.sourceLinks({}), []);
});
