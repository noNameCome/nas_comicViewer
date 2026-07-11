const App = (() => {
  let libraries = [];
  let grid = null;
  let currentLib = null;
  let currentFiles = [];
  let sortPref = 'name_asc';
  let colsPref = 4;
  let searchQuery = '';
  let currentPath = '';
  let activeTab = 'dir';
  let favoriteIds = new Set();

  function q(id) { return document.getElementById(id); }

  function sortFiles(files, pref) {
    const arr = files.slice();
    switch (pref) {
      case 'name_desc': arr.sort((a, b) => ZipTools.naturalCompare(b.path, a.path)); break;
      case 'date_asc': arr.sort((a, b) => new Date(a.mtime || 0) - new Date(b.mtime || 0)); break;
      case 'date_desc': arr.sort((a, b) => new Date(b.mtime || 0) - new Date(a.mtime || 0)); break;
      case 'size_asc': arr.sort((a, b) => (a.size || 0) - (b.size || 0)); break;
      case 'size_desc': arr.sort((a, b) => (b.size || 0) - (a.size || 0)); break;
      case 'name_asc':
      default: arr.sort((a, b) => ZipTools.naturalCompare(a.path, b.path)); break;
    }
    return arr;
  }

  function getChildrenAt(files, path) {
    const prefix = path ? path + '/' : '';
    const folderSet = new Set();
    const directFiles = [];
    for (const f of files) {
      if (prefix && !f.path.startsWith(prefix)) continue;
      const rest = prefix ? f.path.slice(prefix.length) : f.path;
      const slashIdx = rest.indexOf('/');
      if (slashIdx === -1) directFiles.push(f);
      else folderSet.add(rest.slice(0, slashIdx));
    }
    const folders = Array.from(folderSet);
    return { folders, files: directFiles };
  }

  function folderStats(files, folderPath) {
    const prefix = folderPath + '/';
    let maxMtime = 0, totalSize = 0;
    for (const f of files) {
      if (!f.path.startsWith(prefix)) continue;
      const t = new Date(f.mtime || 0).getTime();
      if (t > maxMtime) maxMtime = t;
      totalSize += f.size || 0;
    }
    return { maxMtime, totalSize };
  }

  function sortFolderItems(folderItems, files, pref) {
    const withStats = folderItems.map(f => Object.assign({ stats: folderStats(files, f.path) }, f));
    switch (pref) {
      case 'name_desc': withStats.sort((a, b) => ZipTools.naturalCompare(b.name, a.name)); break;
      case 'date_asc': withStats.sort((a, b) => a.stats.maxMtime - b.stats.maxMtime); break;
      case 'date_desc': withStats.sort((a, b) => b.stats.maxMtime - a.stats.maxMtime); break;
      case 'size_asc': withStats.sort((a, b) => a.stats.totalSize - b.stats.totalSize); break;
      case 'size_desc': withStats.sort((a, b) => b.stats.totalSize - a.stats.totalSize); break;
      case 'name_asc':
      default: withStats.sort((a, b) => ZipTools.naturalCompare(a.name, b.name)); break;
    }
    return withStats;
  }

  function updateComicsTitle() {
    const parts = currentPath ? currentPath.split('/') : [];
    q('comics-title').textContent = parts.length ? `${currentLib.name} / ${parts[parts.length - 1]}` : currentLib.name;
  }

  function render() {
    if (searchQuery) {
      const q2 = searchQuery.toLowerCase();
      const matched = currentFiles.filter(f => f.name.toLowerCase().includes(q2));
      grid.setItems(sortFiles(matched, sortPref).map(rec => ({ type: 'file', rec })));
    } else {
      const { folders, files } = getChildrenAt(currentFiles, currentPath);
      let folderItems = folders.map(name => ({ type: 'folder', name, path: (currentPath ? currentPath + '/' : '') + name }));
      folderItems = sortFolderItems(folderItems, currentFiles, sortPref);
      const fileItems = sortFiles(files, sortPref).map(rec => ({ type: 'file', rec }));
      grid.setItems([...folderItems, ...fileItems]);
    }
    document.querySelectorAll('.sort-option').forEach(el => el.classList.toggle('active', el.dataset.sort === sortPref));
    updateComicsTitle();
  }

  function openFolder(item) {
    currentPath = item.path;
    searchQuery = '';
    q('comics-search').value = '';
    grid.scrollToTop();
    render();
  }

  function libFor(rec) {
    if (currentLib && rec.libraryId === currentLib.id) return currentLib;
    return libraries.find(l => l.id === rec.libraryId) || currentLib;
  }

  function openRecInViewer(rec, list) {
    const lib = libFor(rec);
    if (!lib) return;
    const siblings = activeTab === 'dir' ? list : [rec];
    Viewer.open(lib, rec, siblings, () => {});
  }

  async function renderHistoryTab() {
    const list = await Store.getHistory();
    grid.setItems(list.map(rec => ({ type: 'file', rec })));
  }

  async function renderFavTab() {
    const list = await Store.getFavorites();
    grid.setItems(list.map(rec => ({ type: 'file', rec })));
  }

  function setActiveTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.tab-item').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));
    const isDir = tab === 'dir';
    const isStorage = tab === 'storage';
    q('comics-search-row').style.display = isDir ? '' : 'none';
    q('comics-sort').style.display = isDir ? '' : 'none';
    q('comics-rescan').style.display = isDir ? '' : 'none';
    q('comics-cols').style.display = isStorage ? 'none' : '';
    q('comics-grid').style.display = isStorage ? 'none' : 'block';
    q('tab-storage-list').style.display = isStorage ? 'block' : 'none';
    if (isDir) { render(); return; }
    if (isStorage) { q('comics-title').textContent = '스토리지'; renderStorageTab(); return; }
    if (tab === 'history') { q('comics-title').textContent = '히스토리'; renderHistoryTab(); return; }
    if (tab === 'fav') { q('comics-title').textContent = '즐겨찾기'; renderFavTab(); return; }
  }

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    q(id).classList.add('active');
  }

  let toastTimer = null;
  function toast(msg) {
    const el = q('toast');
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.display = 'none'; }, 2600);
  }

  async function reloadLibraries() {
    libraries = await Store.getLibraries();
    renderLibList();
  }

  function buildLibCard(lib, onClick) {
    const card = document.createElement('div');
    card.className = 'lib-card';
    const proto = lib.https ? 'https' : 'http';
    card.innerHTML = `<div class="lib-icon">📚</div><div class="lib-info"><div class="lib-name"></div><div class="lib-sub"></div></div><div class="lib-actions"><button class="icon-btn ghost edit">✎</button></div>`;
    card.querySelector('.lib-name').textContent = lib.name;
    card.querySelector('.lib-sub').textContent = `${proto}://${lib.host}${lib.port ? ':' + lib.port : ''}${lib.path || '/'}`;
    card.querySelector('.edit').addEventListener('click', ev => { ev.stopPropagation(); SettingsForm.openEdit(lib); });
    card.addEventListener('click', () => onClick(lib));
    return card;
  }

  function renderLibList() {
    const wrap = q('lib-list');
    if (!libraries.length) {
      wrap.innerHTML = '<div class="empty-hint">아직 등록된 경로가 없습니다.<br>오른쪽 아래 + 버튼을 눌러<br>NAS WebDAV 경로를 추가해보세요.</div>';
      return;
    }
    wrap.innerHTML = '';
    for (const lib of libraries) wrap.appendChild(buildLibCard(lib, openLibrary));
  }

  function renderStorageTab() {
    const wrap = q('tab-storage-list');
    if (!libraries.length) {
      wrap.innerHTML = '<div class="empty-hint">등록된 경로가 없습니다.<br>목록 화면에서 + 버튼으로<br>추가해보세요.</div>';
      return;
    }
    wrap.innerHTML = '';
    for (const lib of libraries) wrap.appendChild(buildLibCard(lib, switchLibrary));
  }

  async function switchLibrary(lib) {
    currentLib = lib;
    currentPath = '';
    searchQuery = '';
    q('comics-search').value = '';
    currentFiles = await Store.DB.getFiles(lib.id);
    setActiveTab('dir');
    if (!currentFiles.length) await doScan(lib);
  }

  function setProgress(active, text, pct) {
    const wrap = q('scan-progress');
    if (!active) { wrap.classList.remove('active'); return; }
    wrap.classList.add('active');
    q('scan-progress-text').textContent = text;
    q('scan-progress-bar').style.width = (pct != null ? pct : 0) + '%';
  }

  async function openLibrary(lib) {
    currentLib = lib;
    currentPath = '';
    showScreen('comics-screen');
    if (!grid) {
      grid = createGridView(q('comics-grid'), {
        cols: colsPref,
        onOpen: openRecInViewer,
        onOpenFolder: openFolder,
        getLib: libFor,
        isFavorite: rec => favoriteIds.has(rec.id),
        onToggleFavorite: async rec => {
          const nowFav = await Store.toggleFavorite(rec);
          if (nowFav) favoriteIds.add(rec.id); else favoriteIds.delete(rec.id);
          return nowFav;
        }
      });
    }
    grid.setLibrary(lib);
    searchQuery = '';
    q('comics-search').value = '';
    currentFiles = await Store.DB.getFiles(lib.id);
    setActiveTab('dir');
    if (!currentFiles.length) {
      await doScan(lib);
    }
  }

  async function doScan(lib) {
    setProgress(true, '스캔 준비 중...', 0);
    try {
      const files = await Scan.rescan(lib, ({ dirCount, fileCount, current }) => {
        setProgress(true, `폴더 ${dirCount}개 / 파일 ${fileCount}개 · ${current}`, Math.min(95, dirCount));
      });
      if (currentLib && currentLib.id === lib.id) {
        currentFiles = files;
        render();
      }
      setProgress(false);
      toast(`스캔 완료: ${files.length}개 파일`);
    } catch (e) {
      setProgress(false);
      toast('스캔 실패: ' + e.message);
    }
  }

  function openSortModal() {
    document.querySelectorAll('.sort-option').forEach(el => el.classList.toggle('active', el.dataset.sort === sortPref));
    q('sort-modal').style.display = 'flex';
  }

  function closeSortModal() {
    q('sort-modal').style.display = 'none';
  }

  function openColsModal() {
    document.querySelectorAll('.cols-option').forEach(el => el.classList.toggle('active', parseInt(el.dataset.cols, 10) === colsPref));
    q('cols-modal').style.display = 'flex';
  }

  function closeColsModal() {
    q('cols-modal').style.display = 'none';
  }

  function goBackFromComics() {
    if (activeTab !== 'dir') {
      setActiveTab('dir');
      return;
    }
    if (currentPath) {
      const parts = currentPath.split('/');
      parts.pop();
      currentPath = parts.join('/');
      searchQuery = '';
      q('comics-search').value = '';
      grid.scrollToTop();
      render();
    } else {
      showScreen('lib-screen');
    }
  }

  function handleHardwareBack() {
    if (q('resume-modal').style.display === 'flex') return true;
    if (q('sort-modal').style.display === 'flex') { closeSortModal(); return true; }
    if (q('cols-modal').style.display === 'flex') { closeColsModal(); return true; }
    if (Viewer.isOpen()) { Viewer.close(); return true; }
    if (q('form-screen').classList.contains('active')) { showScreen('lib-screen'); return true; }
    if (q('comics-screen').classList.contains('active')) { goBackFromComics(); return true; }
    return false;
  }

  async function init() {
    Viewer.init();
    SettingsForm.init();
    sortPref = await Store.getSortPref();
    colsPref = await Store.getColsPref();
    favoriteIds = new Set((await Store.getFavorites()).map(r => r.id));
    document.querySelectorAll('.tab-item').forEach(el => {
      el.addEventListener('click', () => setActiveTab(el.dataset.tab));
    });
    q('add-lib-fab').addEventListener('click', () => SettingsForm.openNew());
    q('comics-back').addEventListener('click', goBackFromComics);
    q('comics-rescan').addEventListener('click', () => { if (currentLib) doScan(currentLib); });
    q('comics-sort').addEventListener('click', openSortModal);
    q('sort-modal').addEventListener('click', e => { if (e.target.id === 'sort-modal') closeSortModal(); });
    document.querySelectorAll('.sort-option').forEach(el => {
      el.addEventListener('click', async () => {
        sortPref = el.dataset.sort;
        await Store.setSortPref(sortPref);
        render();
        closeSortModal();
      });
    });
    q('comics-cols').addEventListener('click', openColsModal);
    q('cols-modal').addEventListener('click', e => { if (e.target.id === 'cols-modal') closeColsModal(); });
    document.querySelectorAll('.cols-option').forEach(el => {
      el.addEventListener('click', async () => {
        colsPref = parseInt(el.dataset.cols, 10);
        await Store.setColsPref(colsPref);
        if (grid) grid.setCols(colsPref);
        closeColsModal();
      });
    });
    let searchTimer = null;
    q('comics-search').addEventListener('input', e => {
      clearTimeout(searchTimer);
      const val = e.target.value;
      searchTimer = setTimeout(() => { searchQuery = val; render(); }, 120);
    });
    q('clear-cache-btn').addEventListener('click', clearThumbCache);
    Capacitor.Plugins.App.addListener('backButton', () => {
      if (!handleHardwareBack()) {
        Capacitor.Plugins.App.exitApp();
      }
    });
    reloadLibraries();
    showScreen('lib-screen');
  }

  async function clearThumbCache() {
    try {
      await Capacitor.Plugins.Filesystem.rmdir({ path: 'thumbs', directory: 'CACHE', recursive: true });
      toast('썸네일 캐시를 삭제했습니다');
    } catch (e) {
      toast('삭제할 캐시가 없습니다');
    }
  }

  return { init, showScreen, toast, reloadLibraries, openLibrary };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
