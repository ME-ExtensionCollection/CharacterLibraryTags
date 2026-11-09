// Fake window.marinaraTagMerger (Tag Merger read-only API v2) for the harness, enabled with ?ctm=1.
// Canonicals here are a handful of common sample tags; variants fold onto them.
(() => {
  if (!new URLSearchParams(location.search).has("ctm")) return;
  const mapping = {
    Female: ["#female", "female", "FEMALE"],
    Male: ["male", "#male"],
    NSFW: ["nsfw", "#nsfw"],
    SFW: ["sfw"],
    Fantasy: ["fantasy", "#fantasy"],
    Elf: ["elf", "elves", "Dark Elf"],
    OC: ["oc", "original character"],
    Romance: ["romance"],
    Comedy: ["comedy", "funny"],
    Drama: ["drama"],
    Scenario: ["scenario"],
    Fluff: ["fluff"],
    Angst: ["angst"],
    AnyPOV: ["anypov", "any pov"],
  };
  const norm = (t) => String(t).trim().replace(/^#+/, "").replace(/\s+/g, " ").toLowerCase();
  const lookup = new Map();
  for (const [canonical, variants] of Object.entries(mapping)) for (const v of variants) lookup.set(norm(v), canonical);
  for (const canonical of Object.keys(mapping)) lookup.set(norm(canonical), canonical);
  const mapOne = (tags) => {
    const canonical = [];
    const other = [];
    for (const tag of tags) {
      const hit = lookup.get(norm(tag));
      if (hit) {
        if (!canonical.includes(hit)) canonical.push(hit);
      } else if (!other.includes(tag.trim())) other.push(tag.trim());
    }
    return { canonical, other };
  };
  window.marinaraTagMerger = Object.freeze({
    version: 2,
    async mapTags(tags) {
      return mapOne(tags);
    },
    async mapTagsBatch(list) {
      return list.map(mapOne);
    },
    async canonicalTags() {
      return Object.keys(mapping);
    },
  });
})();
