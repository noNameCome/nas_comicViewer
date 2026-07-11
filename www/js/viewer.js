const Viewer = (() => {
  const MAX_CACHE = 14;
  const PREFETCH_AHEAD = 3;
  const PREFETCH_BEHIND = 1;

  let lib = null;
  let zipReader = null;
  let images = [];
  let rec = null;
  let siblings = [];
  let siblingIdx = -1;
  let curIndex = 0;
  let rotation = 0;
  let userScale = 1;
  let panX = 0, panY = 0;
  let baseScale = 1;
  let natW = 0, natH = 0;
  let orientationLocked = false;
  let isOpenFlag = false;
  const cache = new Map();

  let el = {};
  let onExit = null;

  function q(id) { return document.getElementById(id); }

  function init() {
    el.screen = q('viewer-screen');
    el.stage = q('viewer-stage');
    el.img = q('viewer-img');
    el.loading = q('viewer-loading');
    el.topbar = q('viewer-topbar');
    el.botbar = q('viewer-botbar');
    el.title = q('viewer-title');
    el.pageNum = q('viewer-page-num');
    el.slider = q('viewer-slider');
    el.btnClose = q('viewer-close');
    el.btnRotateL = q('viewer-rotate-l');
    el.btnRotateR = q('viewer-rotate-r');
    el.btnOrientation = q('viewer-orientation');
    el.tapLeft = q('viewer-tap-left');
    el.tapRight = q('viewer-tap-right');
    el.nextOverlay = q('viewer-next-overlay');
    el.nextLabel = q('viewer-next-label');
    el.nextName = q('viewer-next-name');
    el.nextBtn = q('viewer-next-btn');
    el.nextClose = q('viewer-next-close');

    el.btnClose.addEventListener('click', close);
    el.nextClose.addEventListener('click', hideNextPrompt);
    el.nextBtn.addEventListener('click', () => {
      hideNextPrompt();
      if (hasNextComic()) nextComic(); else close();
    });
    el.nextOverlay.addEventListener('pointerdown', e => e.stopPropagation());
    el.btnRotateL.addEventListener('click', () => { rotation = (rotation + 270) % 360; applyTransform(true); });
    el.btnRotateR.addEventListener('click', () => { rotation = (rotation + 90) % 360; applyTransform(true); });
    el.btnOrientation.addEventListener('click', toggleOrientationLock);
    el.slider.addEventListener('input', () => { showPage(parseInt(el.slider.value, 10), false); });
    el.slider.addEventListener('change', () => { showPage(parseInt(el.slider.value, 10), true); });

    setupTouch();
  }

  async function open(library, fileRec, siblingList, exitCb) {
    isOpenFlag = true;
    lib = library;
    rec = fileRec;
    siblings = siblingList || [];
    siblingIdx = siblings.findIndex(s => s.id === rec.id);
    onExit = exitCb;
    rotation = 0; userScale = 1; panX = 0; panY = 0;
    cache.forEach(v => v.url && URL.revokeObjectURL(v.url));
    cache.clear();
    hideNextPrompt();

    el.screen.classList.add('active');
    el.title.textContent = rec.name.replace(/\.[a-z0-9]+$/i, '');
    el.loading.style.display = 'block';
    el.img.style.opacity = '0';

    const headers = { Authorization: Webdav.authHeader(lib) };
    try {
      if (rec.ext === 'zip') {
        const url = Webdav.fullUrl(lib, rec.path);
        const opened = await ZipTools.openZip(url, headers, rec.size);
        zipReader = opened.zipReader;
        images = opened.images;
      } else {
        zipReader = null;
        images = [{ __single: true, filename: rec.name }];
      }
    } catch (e) {
      el.loading.textContent = '열기 실패: ' + e.message;
      return;
    }
    Store.addHistory(rec).catch(() => {});

    el.slider.max = String(Math.max(0, images.length - 1));
    curIndex = 0;
    let startPage = 0;
    if (rec.lastPage && rec.lastPage > 0 && rec.lastPage < images.length - 1) {
      startPage = await askResume(rec.lastPage);
    }
    await showPage(startPage, true);
  }

  function askResume(savedPage) {
    return new Promise(resolve => {
      const modal = q('resume-modal');
      q('resume-text').textContent = `${savedPage + 1}페이지까지 보셨습니다.`;
      modal.style.display = 'flex';
      const btnC = q('resume-continue'), btnR = q('resume-restart');
      const cleanup = () => { modal.style.display = 'none'; btnC.removeEventListener('click', onC); btnR.removeEventListener('click', onR); };
      const onC = () => { cleanup(); resolve(savedPage); };
      const onR = () => { cleanup(); resolve(0); };
      btnC.addEventListener('click', onC);
      btnR.addEventListener('click', onR);
    });
  }

  let saveProgressTimer = null;
  function saveProgress(index) {
    rec.lastPage = index;
    clearTimeout(saveProgressTimer);
    saveProgressTimer = setTimeout(() => {
      Store.DB.updateProgress(rec.id, index).catch(() => {});
    }, 400);
  }

  async function close() {
    isOpenFlag = false;
    el.screen.classList.remove('active');
    clearTimeout(saveProgressTimer);
    if (rec && curIndex > 0) Store.DB.updateProgress(rec.id, curIndex).catch(() => {});
    if (zipReader) { try { await zipReader.close(); } catch (e) {} zipReader = null; }
    cache.forEach(v => v.url && URL.revokeObjectURL(v.url));
    cache.clear();
    images = [];
    if (orientationLocked) {
      orientationLocked = false;
      el.btnOrientation.classList.remove('on');
      Capacitor.Plugins.ScreenOrientation.unlock().catch(() => {});
    }
    if (onExit) onExit();
  }

  async function toggleOrientationLock() {
    orientationLocked = !orientationLocked;
    el.btnOrientation.classList.toggle('on', orientationLocked);
    try {
      if (orientationLocked) {
        await Capacitor.Plugins.ScreenOrientation.lock({ orientation: 'landscape' });
      } else {
        await Capacitor.Plugins.ScreenOrientation.unlock();
      }
    } catch (e) {}
    setTimeout(() => applyTransform(true), 350);
  }

  function evictIfNeeded() {
    while (cache.size > MAX_CACHE) {
      const oldestKey = cache.keys().next().value;
      const v = cache.get(oldestKey);
      if (v && v.url) URL.revokeObjectURL(v.url);
      cache.delete(oldestKey);
    }
  }

  async function loadEntry(index) {
    if (index < 0 || index >= images.length) return null;
    if (cache.has(index)) {
      const v = cache.get(index);
      cache.delete(index); cache.set(index, v);
      return v;
    }
    const entry = images[index];
    let url;
    if (entry.__single) {
      const headers = { Authorization: Webdav.authHeader(lib) };
      const bytes = await Webdav.getFull(Webdav.fullUrl(lib, rec.path), headers);
      url = ZipTools.bytesToDataUrl(bytes, rec.name);
    } else {
      const bytes = await ZipTools.readEntryBytes(entry);
      url = ZipTools.bytesToDataUrl(bytes, entry.filename);
    }
    const v = { url };
    cache.set(index, v);
    evictIfNeeded();
    return v;
  }

  function prefetchAround(index) {
    for (let i = index + 1; i <= index + PREFETCH_AHEAD; i++) loadEntry(i).catch(() => {});
    for (let i = index - 1; i >= index - PREFETCH_BEHIND; i--) loadEntry(i).catch(() => {});
  }

  async function showPage(index, resetView) {
    if (index < 0 || index >= images.length) return;
    hideNextPrompt();
    curIndex = index;
    el.slider.value = String(index);
    el.pageNum.textContent = `${index + 1} / ${images.length}`;
    el.loading.style.display = 'block';
    saveProgress(index);
    let v;
    try {
      v = await loadEntry(index);
    } catch (e) {
      el.loading.textContent = '이미지 로드 실패';
      return;
    }
    if (curIndex !== index) return;
    el.loading.style.display = 'none';
    el.img.onload = () => {
      natW = el.img.naturalWidth; natH = el.img.naturalHeight;
      if (resetView !== false) { userScale = 1; panX = 0; panY = 0; }
      applyTransform(true);
      el.img.style.opacity = '1';
    };
    el.img.src = v.url;
    prefetchAround(index);
  }

  function fitScale() {
    const cw = el.stage.clientWidth, ch = el.stage.clientHeight;
    if (!natW || !natH) return 1;
    const rot = rotation % 180 !== 0;
    const effW = rot ? natH : natW;
    const effH = rot ? natW : natH;
    return Math.min(cw / effW, ch / effH);
  }

  function applyTransform(recomputeBase) {
    if (recomputeBase) baseScale = fitScale();
    const scale = baseScale * userScale;
    el.img.style.transform = `translate(-50%, -50%) translate(${panX}px, ${panY}px) rotate(${rotation}deg) scale(${scale})`;
  }

  function nextPage() {
    if (curIndex < images.length - 1) showPage(curIndex + 1, true);
    else showNextPrompt();
  }
  function prevPage() {
    if (curIndex > 0) showPage(curIndex - 1, true);
  }

  function hasNextComic() {
    return siblingIdx >= 0 && siblingIdx < siblings.length - 1;
  }

  function showNextPrompt() {
    if (hasNextComic()) {
      const next = siblings[siblingIdx + 1];
      el.nextLabel.textContent = '마지막 페이지까지 보셨습니다';
      el.nextName.textContent = next.name.replace(/\.[a-z0-9]+$/i, '');
      el.nextBtn.textContent = '다음 작품 보기 ›';
    } else {
      el.nextLabel.textContent = '마지막 작품입니다';
      el.nextName.textContent = '';
      el.nextBtn.textContent = '목록으로';
    }
    el.nextOverlay.style.display = 'flex';
  }

  function hideNextPrompt() {
    el.nextOverlay.style.display = 'none';
  }

  async function nextComic() {
    if (siblingIdx >= 0 && siblingIdx < siblings.length - 1) {
      const next = siblings[siblingIdx + 1];
      await open(lib, next, siblings, onExit);
    }
  }

  function toggleBars() {
    el.topbar.classList.toggle('hidden');
    el.botbar.classList.toggle('hidden');
  }

  function setupTouch() {
    const pointers = new Map();
    let mode = null;
    let startX = 0, startY = 0, startPanX = 0, startPanY = 0;
    let pinchStartDist = 0, pinchStartScale = 1;
    let lastTapTime = 0, lastTapX = 0, lastTapY = 0;
    let dragDX = 0;

    function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

    el.stage.addEventListener('pointerdown', e => {
      el.stage.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        mode = 'pan-or-swipe';
        startX = e.clientX; startY = e.clientY;
        startPanX = panX; startPanY = panY;
        dragDX = 0;
      } else if (pointers.size === 2) {
        mode = 'pinch';
        const pts = Array.from(pointers.values());
        pinchStartDist = dist(pts[0], pts[1]);
        pinchStartScale = userScale;
      }
    });

    el.stage.addEventListener('pointermove', e => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (mode === 'pinch' && pointers.size === 2) {
        const pts = Array.from(pointers.values());
        const d = dist(pts[0], pts[1]);
        if (pinchStartDist > 0) {
          userScale = Math.max(1, Math.min(6, pinchStartScale * (d / pinchStartDist)));
          applyTransform(false);
        }
      } else if (mode === 'pan-or-swipe' && pointers.size === 1) {
        const dx = e.clientX - startX, dy = e.clientY - startY;
        if (userScale > 1.02) {
          panX = startPanX + dx;
          panY = startPanY + dy;
          applyTransform(false);
        } else {
          dragDX = dx;
          panX = startPanX + dx * 0.4;
          applyTransform(false);
        }
      }
    });

    function endGesture(e) {
      pointers.delete(e.pointerId);
      if (pointers.size === 0) {
        if (mode === 'pan-or-swipe' && userScale <= 1.02) {
          const now = Date.now();
          const isTap = Math.abs(dragDX) < 12;
          panX = 0; panY = 0;
          applyTransform(false);
          if (isTap) {
            const w = el.stage.clientWidth;
            const xr = e.clientX / w;
            if (xr < 0.25) {
              prevPage();
              lastTapTime = 0;
            } else if (xr > 0.75) {
              nextPage();
              lastTapTime = 0;
            } else {
              const isDoubleTap = (now - lastTapTime) < 320 && Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < 40;
              lastTapTime = now; lastTapX = e.clientX; lastTapY = e.clientY;
              if (isDoubleTap) {
                userScale = userScale > 1.02 ? 1 : 2.4;
                applyTransform(false);
                lastTapTime = 0;
              } else {
                toggleBars();
              }
            }
          } else if (dragDX < -60) {
            nextPage();
          } else if (dragDX > 60) {
            prevPage();
          }
        } else if (userScale <= 1.02) {
          panX = 0; panY = 0; applyTransform(false);
        }
        mode = null;
      } else if (pointers.size === 1) {
        const pts = Array.from(pointers.values());
        startX = pts[0].x; startY = pts[0].y;
        startPanX = panX; startPanY = panY;
        mode = 'pan-or-swipe';
        dragDX = 0;
      }
    }

    el.stage.addEventListener('pointerup', endGesture);
    el.stage.addEventListener('pointercancel', endGesture);
  }

  return { init, open, close, isOpen: () => isOpenFlag };
})();
