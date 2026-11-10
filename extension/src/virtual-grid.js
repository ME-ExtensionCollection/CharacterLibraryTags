// Character Manager: virtualized card grid. Only the rows in view (plus a
// buffer) exist in the DOM, so tens of thousands of characters scroll smoothly.
// Cards keep their node while they stay in range, so avatars are not reloaded.
// When the grid's width changes (the details pane opens or closes, the window
// resizes) the columns reflow around an anchor card, which keeps its place on
// screen, and the cards still in view glide to their new spots.

const CLMVirtualGrid = (() => {
  "use strict";

  const BUFFER_ROWS = 3;
  const REFLOW_MS = 220;
  const reducedMotion = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  /**
   * @param {HTMLElement} viewport scrolling element
   * @param {{
   *   gap: number,
   *   size: () => { width: number, heightFor: (cellWidth: number) => number },
   *   create: (card) => HTMLElement,
   *   update: (node, card) => void,
   *   anchorId?: () => string | null, card to hold in place when the columns reflow
   * }} options
   */
  function create(viewport, options) {
    const spacer = document.createElement("div");
    spacer.className = "clm-grid-spacer";
    viewport.append(spacer);

    let items = [];
    let columns = 1;
    let cellWidth = 0;
    let cellHeight = 0;
    let rowHeight = 0;
    let offsetX = 0;
    let frame = 0;
    let lastHeight = 0;
    const nodes = new Map(); // id -> node
    const placed = new Map(); // id -> [x, y, width, height] last written to the node

    function layout() {
      const { width, heightFor } = options.size();
      // Columns come from the preferred width; cells then stretch to fill the row (as in ACM).
      const available = Math.max(0, viewport.clientWidth - options.gap);
      columns = Math.max(1, Math.floor(available / (width + options.gap)));
      cellWidth = Math.max(40, Math.floor(available / columns) - options.gap);
      cellHeight = heightFor(cellWidth);
      rowHeight = cellHeight + options.gap;
      offsetX = options.gap;
      const rows = Math.ceil(items.length / columns);
      spacer.style.height = `${rows * rowHeight + options.gap}px`;
    }

    const rowTop = (index, cols, rowH) => options.gap + Math.floor(index / cols) * rowH;

    /**
     * After a reflow, scroll so the anchor card sits where it was on screen: the
     * anchorId() card if it was in view, else the first card of the middle row.
     */
    function reanchor(before) {
      if (!items.length) return;
      const visible = (y) => y + before.rowHeight > before.top && y < before.top + before.height;
      const preferred = options.anchorId?.();
      let index = preferred ? items.findIndex((c) => c.id === preferred) : -1;
      if (index < 0 || !visible(rowTop(index, before.columns, before.rowHeight))) {
        const middleRow = Math.floor((before.top + before.height / 2 - options.gap) / before.rowHeight);
        index = Math.min(items.length - 1, Math.max(0, middleRow) * before.columns);
      }
      const offset = rowTop(index, before.columns, before.rowHeight) - before.top;
      // Keep the anchor fully in view even if the viewport got shorter.
      const clamped = Math.min(Math.max(0, offset), Math.max(0, viewport.clientHeight - rowHeight));
      viewport.scrollTop = rowTop(index, columns, rowHeight) - clamped;
    }

    function render() {
      frame = 0;
      const before = { columns, cellWidth, rowHeight, top: viewport.scrollTop, height: lastHeight };
      layout();
      const reflowed =
        before.rowHeight > 0 && before.height > 0 && viewport.clientWidth > 0 &&
        (columns !== before.columns || cellWidth !== before.cellWidth);
      if (reflowed) reanchor(before);
      lastHeight = viewport.clientHeight;
      const animate = reflowed && !reducedMotion();
      const scrollDelta = viewport.scrollTop - before.top;
      const top = viewport.scrollTop;
      const firstRow = Math.max(0, Math.floor(top / rowHeight) - BUFFER_ROWS);
      const lastRow = Math.ceil((top + viewport.clientHeight) / rowHeight) + BUFFER_ROWS;
      const start = firstRow * columns;
      const end = Math.min(items.length, (lastRow + 1) * columns);
      const keep = new Set();
      for (let i = start; i < end; i += 1) {
        const card = items[i];
        keep.add(card.id);
        let node = nodes.get(card.id);
        const isNew = !node;
        if (isNew) {
          node = options.create(card);
          nodes.set(card.id, node);
          spacer.append(node);
        }
        options.update(node, card, i);
        const row = Math.floor(i / columns);
        const col = i % columns;
        const x = offsetX + col * (cellWidth + options.gap);
        const y = options.gap + row * rowHeight;
        const transform = `translate(${x}px, ${y}px)`;
        if (node.style.transform !== transform) node.style.transform = transform;
        if (node.style.width !== `${cellWidth}px`) node.style.width = `${cellWidth}px`;
        if (node.style.height !== `${cellHeight}px`) node.style.height = `${cellHeight}px`;
        if (animate && typeof node.animate === "function") glide(node, isNew ? null : placed.get(card.id), scrollDelta, [x, y]);
        placed.set(card.id, [x, y, cellWidth, cellHeight]);
      }
      for (const [id, node] of nodes) {
        if (!keep.has(id)) {
          node.remove();
          nodes.delete(id);
          placed.delete(id);
        }
      }
    }

    /** Slide a card from its old screen position to its new one; cards new to the view fade in. */
    function glide(node, old, scrollDelta, [x, y]) {
      for (const running of node.getAnimations()) running.cancel();
      const timing = { duration: REFLOW_MS, easing: "cubic-bezier(0.2, 0, 0, 1)" };
      if (!old) {
        node.animate([{ opacity: 0 }, { opacity: 1 }], timing);
        return;
      }
      // Same screen spot as before = old position in the grid shifted by the scroll change.
      const [ox, oy, ow, oh] = old;
      node.animate(
        [
          { transform: `translate(${ox}px, ${oy + scrollDelta}px)`, width: `${ow}px`, height: `${oh}px` },
          { transform: `translate(${x}px, ${y}px)`, width: `${cellWidth}px`, height: `${cellHeight}px` },
        ],
        timing,
      );
    }

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(render);
    };
    viewport.addEventListener("scroll", schedule, { passive: true });
    // Lay out in the observer callback (before paint), so a reflow never shows a frame of the old columns.
    const resizeObserver = new ResizeObserver(() => {
      if (frame) cancelAnimationFrame(frame);
      render();
    });
    resizeObserver.observe(viewport);

    return {
      setItems(next, { keepScroll = true } = {}) {
        items = next;
        if (!keepScroll) viewport.scrollTop = 0;
        render();
      },
      /** Re-run update() on every visible card (selection, favorite, …). */
      refresh: render,
      relayout: schedule,
      get columns() {
        return columns;
      },
      get rowHeight() {
        return rowHeight;
      },
      scrollToIndex(index) {
        if (index < 0 || index >= items.length) return;
        layout();
        const row = Math.floor(index / columns);
        const top = options.gap + row * rowHeight;
        if (top < viewport.scrollTop) viewport.scrollTop = top - options.gap;
        else if (top + rowHeight > viewport.scrollTop + viewport.clientHeight) {
          viewport.scrollTop = top + rowHeight - viewport.clientHeight;
        }
        render();
      },
      nodeFor: (id) => nodes.get(id) ?? null,
      destroy() {
        if (frame) cancelAnimationFrame(frame);
        resizeObserver.disconnect();
        viewport.removeEventListener("scroll", schedule);
        nodes.clear();
        placed.clear();
        spacer.remove();
      },
    };
  }

  return Object.freeze({ create });
})();
