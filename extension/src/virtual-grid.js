// Character Manager: virtualized card grid. Only the rows in view (plus a
// buffer) exist in the DOM, so tens of thousands of characters scroll smoothly.
// Cards keep their node while they stay in range, so avatars are not reloaded.

const CLMVirtualGrid = (() => {
  "use strict";

  const BUFFER_ROWS = 3;

  /**
   * @param {HTMLElement} viewport scrolling element
   * @param {{
   *   gap: number,
   *   size: () => { width: number, height: number },
   *   create: (card) => HTMLElement,
   *   update: (node, card) => void,
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
    const nodes = new Map(); // id -> node

    function layout() {
      const { width, height } = options.size();
      const available = Math.max(0, viewport.clientWidth - options.gap);
      columns = Math.max(1, Math.floor(available / (width + options.gap)));
      cellWidth = width;
      cellHeight = height;
      rowHeight = height + options.gap;
      // Centre the block of columns.
      offsetX = Math.max(0, Math.floor((available - columns * (width + options.gap)) / 2)) + options.gap;
      const rows = Math.ceil(items.length / columns);
      spacer.style.height = `${rows * rowHeight + options.gap}px`;
    }

    function render() {
      frame = 0;
      layout();
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
        if (!node) {
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
      }
      for (const [id, node] of nodes) {
        if (!keep.has(id)) {
          node.remove();
          nodes.delete(id);
        }
      }
    }

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(render);
    };
    viewport.addEventListener("scroll", schedule, { passive: true });
    const resizeObserver = new ResizeObserver(schedule);
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
        spacer.remove();
      },
    };
  }

  return Object.freeze({ create });
})();
