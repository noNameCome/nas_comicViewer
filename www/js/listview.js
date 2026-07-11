function createGridView(container, opts) {
  const MIN_TILE_W = 100;
  const THUMB_ASPECT = 1.44;
  const EXTRA_H = 49;
  let items = [];
  let fileRecs = [];
  let lib = null;
  let cols = 3;
  let tileW = 100;
  let thumbH = 151;
  let rowH = 200;
  let forcedCols = (opts && opts.cols) || null;
  const inner = document.createElement('div');
  inner.className = 'grid-inner';
  container.innerHTML = '';
  container.appendChild(inner);

  const rendered = new Map();

  function libFor(rec) {
    return (opts.getLib && opts.getLib(rec)) || lib;
  }

  function layout() {
    const w = container.clientWidth;
    cols = forcedCols || Math.max(3, Math.floor(w / MIN_TILE_W));
    tileW = w / cols;
    thumbH = Math.round((tileW - 12) * THUMB_ASPECT);
    rowH = thumbH + EXTRA_H;
    const rows = Math.ceil(items.length / cols);
    inner.style.height = `${rows * rowH}px`;
  }

  function tileHtml() {
    const el = document.createElement('div');
    el.className = 'tile';
    el.innerHTML = '<div class="thumb"><div class="ph">📕</div></div><div class="name"></div><div class="pages"></div><button class="tile-fav-btn" type="button">☆</button>';
    return el;
  }

  function renderVisible() {
    const scrollTop = container.scrollTop;
    const viewH = container.clientHeight;
    const firstRow = Math.max(0, Math.floor(scrollTop / rowH) - 2);
    const lastRow = Math.ceil((scrollTop + viewH) / rowH) + 2;
    const firstIdx = firstRow * cols;
    const lastIdx = Math.min(items.length, (lastRow + 1) * cols);

    for (const [idx, el] of rendered) {
      if (idx < firstIdx || idx >= lastIdx) {
        el.remove();
        rendered.delete(idx);
      }
    }

    for (let idx = firstIdx; idx < lastIdx; idx++) {
      if (rendered.has(idx) || !items[idx]) continue;
      const item = items[idx];
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      const el = tileHtml();
      el.style.left = `${col * tileW}px`;
      el.style.top = `${row * rowH}px`;
      el.style.width = `${tileW}px`;
      el.querySelector('.thumb').style.height = `${thumbH}px`;

      if (item.type === 'folder') {
        el.querySelector('.name').textContent = item.name;
        el.querySelector('.thumb').innerHTML = '<div class="ph folder-ph">📁</div>';
        el.addEventListener('click', () => opts.onOpenFolder(item));
      } else {
        const rec = item.rec;
        el.querySelector('.name').textContent = rec.name.replace(/\.[a-z0-9]+$/i, '');
        const pagesEl = el.querySelector('.pages');
        if (rec.pageCount) pagesEl.textContent = `${rec.pageCount}p`;
        el.addEventListener('click', () => opts.onOpen(rec, fileRecs));
        const favBtn = el.querySelector('.tile-fav-btn');
        const fav = opts.isFavorite ? opts.isFavorite(rec) : false;
        favBtn.textContent = fav ? '★' : '☆';
        favBtn.classList.toggle('on', fav);
        favBtn.style.display = 'flex';
        favBtn.addEventListener('click', async e => {
          e.stopPropagation();
          if (!opts.onToggleFavorite) return;
          const nowFav = await opts.onToggleFavorite(rec);
          favBtn.textContent = nowFav ? '★' : '☆';
          favBtn.classList.toggle('on', nowFav);
        });
        Thumb.getThumb(libFor(rec), rec).then(result => {
          if (!result || !rendered.has(idx)) return;
          const imgEl = el.querySelector('.thumb');
          imgEl.innerHTML = `<img src="${result.src}">`;
          if (result.pageCount) {
            rec.pageCount = result.pageCount;
            pagesEl.textContent = `${result.pageCount}p`;
          }
        });
      }

      inner.appendChild(el);
      rendered.set(idx, el);
    }
  }

  let rafPending = false;
  function onScroll() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => { rafPending = false; renderVisible(); });
  }

  container.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => { layout(); renderVisible(); });

  return {
    setLibrary(l) { lib = l; },
    setItems(list) {
      items = list;
      fileRecs = list.filter(it => it.type === 'file').map(it => it.rec);
      rendered.forEach(el => el.remove());
      rendered.clear();
      layout();
      renderVisible();
    },
    setCols(n) {
      forcedCols = n;
      rendered.forEach(el => el.remove());
      rendered.clear();
      layout();
      renderVisible();
    },
    scrollToTop() { container.scrollTop = 0; }
  };
}
