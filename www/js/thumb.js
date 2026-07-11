const Thumb = (() => {
  const CACHE_DIR = 'thumbs';
  const MAX_DIM = 320;

  function hash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
  }

  function keyFor(rec) {
    return hash(`${rec.libraryId}::${rec.path}`) + '.jpg';
  }

  async function bytesToBase64(bytes) {
    return Webdav.b64FromBytes(bytes);
  }

  async function statThumb(fileName) {
    try {
      const res = await Capacitor.Plugins.Filesystem.stat({ path: `${CACHE_DIR}/${fileName}`, directory: 'CACHE' });
      return res;
    } catch (e) {
      return null;
    }
  }

  async function existingUrl(rec) {
    const fileName = keyFor(rec);
    const st = await statThumb(fileName);
    if (!st) return null;
    const uriRes = await Capacitor.Plugins.Filesystem.getUri({ path: `${CACHE_DIR}/${fileName}`, directory: 'CACHE' });
    return Capacitor.convertFileSrc(uriRes.uri);
  }

  async function decodeToCanvas(bytes, mimeHint) {
    const blob = new Blob([bytes], { type: mimeHint || 'image/jpeg' });
    const bitmap = await createImageBitmap(blob);
    let w = bitmap.width, h = bitmap.height;
    const scale = Math.min(1, MAX_DIM / Math.max(w, h));
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close && bitmap.close();
    return canvas;
  }

  async function canvasToJpegBase64(canvas) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.72));
    const buf = await blob.arrayBuffer();
    return Webdav.b64FromBytes(new Uint8Array(buf));
  }

  async function saveThumb(fileName, base64) {
    await Capacitor.Plugins.Filesystem.mkdir({ path: CACHE_DIR, directory: 'CACHE', recursive: true }).catch(() => {});
    await Capacitor.Plugins.Filesystem.writeFile({ path: `${CACHE_DIR}/${fileName}`, directory: 'CACHE', data: base64 });
    const uriRes = await Capacitor.Plugins.Filesystem.getUri({ path: `${CACHE_DIR}/${fileName}`, directory: 'CACHE' });
    return Capacitor.convertFileSrc(uriRes.uri);
  }

  async function generate(lib, rec) {
    const headers = { Authorization: Webdav.authHeader(lib) };
    if (rec.ext === 'zip') {
      const url = Webdav.fullUrl(lib, rec.path);
      const { zipReader, images } = await ZipTools.openZip(url, headers, rec.size);
      try {
        if (!images.length) return null;
        const bytes = await ZipTools.readEntryBytes(images[0]);
        const canvas = await decodeToCanvas(bytes);
        const b64 = await canvasToJpegBase64(canvas);
        const fileName = keyFor(rec);
        const src = await saveThumb(fileName, b64);
        return { src, pageCount: images.length };
      } finally {
        await zipReader.close();
      }
    } else {
      const url = Webdav.fullUrl(lib, rec.path);
      const bytes = await Webdav.getFull(url, headers);
      const canvas = await decodeToCanvas(bytes);
      const b64 = await canvasToJpegBase64(canvas);
      const fileName = keyFor(rec);
      const src = await saveThumb(fileName, b64);
      return { src, pageCount: 1 };
    }
  }

  const inflight = new Map();

  async function getThumb(lib, rec) {
    const cached = await existingUrl(rec);
    if (cached) return { src: cached, pageCount: rec.pageCount };
    const key = rec.id;
    if (inflight.has(key)) return inflight.get(key);
    const p = generate(lib, rec).catch(() => null).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  return { getThumb, keyFor };
})();
