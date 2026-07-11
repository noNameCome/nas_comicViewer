const ZipTools = (() => {
  const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp)$/i;

  class WebdavRangeReader extends zip.Reader {
    constructor(url, headers, size) {
      super();
      this.url = url;
      this.headers = headers;
      this.size = size;
    }
    async init() {}
    async readUint8Array(index, length) {
      const end = Math.max(index, index + length - 1);
      return Webdav.getRange(this.url, this.headers, index, end);
    }
  }

  function naturalCompare(a, b) {
    const ax = [], bx = [];
    a.replace(/(\d+)|(\D+)/g, (_, d, s) => { ax.push([d ? parseInt(d, 10) : Infinity, s || '']); return ''; });
    b.replace(/(\d+)|(\D+)/g, (_, d, s) => { bx.push([d ? parseInt(d, 10) : Infinity, s || '']); return ''; });
    while (ax.length && bx.length) {
      const an = ax.shift(), bn = bx.shift();
      const nc = an[0] - bn[0];
      if (nc) return nc;
      const sc = an[1].localeCompare(bn[1]);
      if (sc) return sc;
    }
    return ax.length - bx.length;
  }

  async function openZip(url, headers, size) {
    const reader = new WebdavRangeReader(url, headers, size);
    const zipReader = new zip.ZipReader(reader, { useWebWorkers: false });
    const entries = await zipReader.getEntries();
    const images = entries
      .filter(e => !e.directory && IMAGE_EXT.test(e.filename))
      .sort((a, b) => naturalCompare(a.filename, b.filename));
    return { zipReader, images };
  }

  async function readEntryBytes(entry) {
    const writer = new zip.Uint8ArrayWriter();
    return entry.getData(writer);
  }

  function bytesToDataUrl(bytes, filename) {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : ext === 'bmp' ? 'image/bmp' : 'image/jpeg';
    const blob = new Blob([bytes], { type: mime });
    return URL.createObjectURL(blob);
  }

  return { openZip, readEntryBytes, bytesToDataUrl, naturalCompare, IMAGE_EXT };
})();
