// Fake window.marinaraCharTriage (Char Triage API v1) for the harness, enabled with ?ctr=1.
// Scores: card N (mock-0000N) gets (N % 10) / 10, so bands are predictable; every
// 7th card is unscored. Decisions are recorded in window.__triageLog for tests.
(() => {
  if (!new URLSearchParams(location.search).has("ctr")) return;
  const log = [];
  window.__triageLog = log;
  let scores = new Map();
  let learn = true;
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
      window.dispatchEvent(new CustomEvent("marinara-char-triage:changed"));
    },
    setLearn(value) {
      learn = value;
    },
    opened: 0,
  };
  window.marinaraCharTriage = Object.freeze({
    version: 1,
    ready: async () => {},
    scores: () => scores,
    scoreOf: (id) => scores.get(id) ?? null,
    bucketOf: (id) => (scores.has(id) ? Math.min(5, 1 + Math.floor(scores.get(id) * 5)) : null),
    answers: () => null,
    decisionOf: (id) => decided.get(id) ?? null,
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
      return n;
    },
    scanState: () => ({ running: false }),
    openPanel: () => {
      window.__triage.opened += 1;
    },
  });
})();
