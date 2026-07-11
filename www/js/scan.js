const Scan = (() => {
  const COMIC_EXT = /\.(zip|jpe?g|png|webp)$/i;

  function extOf(name) {
    const m = name.match(/\.([a-z0-9]+)$/i);
    return m ? m[1].toLowerCase() : '';
  }

  async function scanLibrary(lib, onProgress) {
    const results = [];
    let dirCount = 0;
    let fileCount = 0;
    const queue = [''];
    while (queue.length) {
      const relPath = queue.shift();
      dirCount++;
      if (onProgress) onProgress({ phase: 'scan', dirCount, fileCount, current: relPath || '/' });
      let items;
      try {
        items = await Webdav.listDir(lib, relPath);
      } catch (e) {
        continue;
      }
      for (const item of items) {
        const childRel = relPath ? relPath.replace(/\/$/, '') + '/' + item.name : item.name;
        if (item.isDir) {
          queue.push(childRel);
        } else if (COMIC_EXT.test(item.name)) {
          fileCount++;
          results.push({
            id: `${lib.id}::${childRel}`,
            libraryId: lib.id,
            path: childRel,
            name: item.name,
            ext: extOf(item.name),
            size: item.size,
            mtime: item.mtime
          });
          if (onProgress && fileCount % 50 === 0) onProgress({ phase: 'scan', dirCount, fileCount, current: childRel });
        }
      }
    }
    return results;
  }

  async function rescan(lib, onProgress) {
    const files = await scanLibrary(lib, onProgress);
    await Store.DB.clearLibrary(lib.id);
    if (files.length) await Store.DB.putFiles(files);
    await Store.DB.setMeta(`scanned_${lib.id}`, Date.now());
    return files;
  }

  return { scanLibrary, rescan };
})();
