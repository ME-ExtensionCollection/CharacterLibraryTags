// Fake window.marinaraCharTriage (Char Triage API v1) for the harness, enabled with ?ctr=1.
// Scores: card N (mock-0000N) gets (N % 10) / 10, so bands are predictable; every
// 7th card is unscored. Decisions are recorded in window.__triageLog for tests.
(() => {
  if (!new URLSearchParams(location.search).has("ctr")) return;
  const log = [];
  window.__triageLog = log;
  let scores = new Map();
  let imageTags = new Map();
  let learn = true;
  // Picture tags: every 4th card (shifted by `offset`) shows inflation, every 8th clearly; odd cards long hair.
  const buildTags = (offset = 0) => {
    const next = new Map();
    for (let n = 0; n < 4000; n += 1) {
      const tags = [];
      if ((n + offset) % 4 === 0) tags.push("image:inflation", "image:inflation:1");
      if ((n + offset) % 8 === 0) tags.push("image:inflation:2");
      if (n % 2) tags.push("image:long_hair");
      if (tags.length) next.set(`mock-${String(n).padStart(5, "0")}`, tags);
    }
    imageTags = next;
  };
  buildTags();
  const build = (shift = 0) => {
    const next = new Map();
    for (let n = 0; n < 4000; n += 1) {
      if (n % 7 === 6) continue;
      next.set(`mock-${String(n).padStart(5, "0")}`, ((n + shift) % 10) / 10 + 0.05);
    }
    scores = next;
  };
  build();
  const decided = new Map();
  window.__triage = {
    /** Pretend the model retrained: shift every score, fire the change event. */
    retrain(shift = 1) {
      build(shift);
      buildTags(shift);
      window.dispatchEvent(new CustomEvent("marinara-char-triage:changed"));
    },
    setLearn(value) {
      learn = value;
    },
    opened: 0,
    scanned: [],
  };
  window.marinaraCharTriage = Object.freeze({
    version: 1,
    ready: async () => {},
    scores: () => scores,
    scoreOf: (id) => scores.get(id) ?? null,
    bucketOf: (id) => (scores.has(id) ? Math.max(0, Math.min(5, Math.round(scores.get(id) * 5))) : null),
    answers: () => null,
    decisionOf: (id) => decided.get(id) ?? null,
    decisions: () => new Map(decided),
    learnFromDeletes: () => learn,
    beforeDelete: async (cards, { learnById = {} } = {}) => {
      for (const c of cards) {
        const id = c.id ?? c;
        decided.set(id, "delete");
        log.push({ id, decision: "delete", learn: learnById[id] ?? learn, isItem: Array.isArray(c.tags) && "avatarPath" in c });
      }
    },
    recordKeep: async (cards, { implied = false } = {}) => {
      let n = 0;
      for (const c of cards) {
        const id = c.id ?? c;
        if (implied && decided.has(id)) continue;
        decided.set(id, implied ? "implied-keep" : "keep");
        log.push({ id, decision: implied ? "implied-keep" : "keep" });
        n += 1;
      }
      // Like Char Triage: a new decision means a change event.
      window.dispatchEvent(new CustomEvent("marinara-char-triage:changed"));
      return n;
    },
    scanState: () => ({ running: false }),
    imageTags: () => imageTags,
    imageTagsOf: (id) => imageTags.get(id) ?? [],
    scanCards: async (ids) => {
      window.__triage.scanned.push(...ids);
      return ids.length;
    },
    openPanel: () => {
      window.__triage.opened += 1;
    },
  });
})();
