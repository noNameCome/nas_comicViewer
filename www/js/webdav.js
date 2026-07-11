const Webdav = (() => {
  function b64FromBytes(bytes) {
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function bytesFromB64(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function baseUrl(lib) {
    const proto = lib.https ? 'https' : 'http';
    const port = lib.port ? `:${lib.port}` : '';
    return `${proto}://${lib.host}${port}`;
  }

  function joinPath(base, relPath) {
    const segs = relPath.split('/').filter(Boolean).map(encodeURIComponent);
    return base.replace(/\/$/, '') + '/' + segs.join('/');
  }

  function authHeader(lib) {
    const raw = `${lib.username || ''}:${lib.password || ''}`;
    return 'Basic ' + btoa(unescape(encodeURIComponent(raw)));
  }

  async function raw({ url, method = 'GET', headers = {}, body = null, binary = false }) {
    const res = await Capacitor.Plugins.WebdavHttp.request({ url, method, headers, body, binary });
    return res;
  }

  async function request(lib, relPath, opts = {}) {
    const url = joinPath(baseUrl(lib), lib.path || '/') + (relPath ? '' : '');
    const headers = Object.assign({ Authorization: authHeader(lib) }, opts.headers || {});
    return raw({ url: opts.url || url, method: opts.method || 'GET', headers, body: opts.body, binary: opts.binary });
  }

  function fullUrl(lib, relPath) {
    const rootUrl = joinPath(baseUrl(lib), lib.path || '/');
    if (!relPath) return rootUrl;
    return rootUrl.replace(/\/$/, '') + '/' + relPath.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  }

  const PROPFIND_BODY = '<?xml version="1.0" encoding="utf-8" ?><D:propfind xmlns:D="DAV:"><D:prop><D:displayname/><D:resourcetype/><D:getcontentlength/><D:getlastmodified/></D:prop></D:propfind>';

  function decodeHref(href) {
    try { return decodeURIComponent(href); } catch (e) { return href; }
  }

  function parseMultistatus(xmlText, baseHrefPath) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');
    const responses = Array.from(doc.getElementsByTagNameNS('DAV:', 'response'));
    const items = [];
    for (const resp of responses) {
      const hrefEl = resp.getElementsByTagNameNS('DAV:', 'href')[0];
      if (!hrefEl) continue;
      let href = decodeHref(hrefEl.textContent.trim());
      href = href.replace(/^https?:\/\/[^/]+/, '');
      if (href.replace(/\/$/, '') === baseHrefPath.replace(/\/$/, '')) continue;
      const isDir = resp.getElementsByTagNameNS('DAV:', 'collection').length > 0;
      const lenEl = resp.getElementsByTagNameNS('DAV:', 'getcontentlength')[0];
      const modEl = resp.getElementsByTagNameNS('DAV:', 'getlastmodified')[0];
      const nameEl = resp.getElementsByTagNameNS('DAV:', 'displayname')[0];
      const size = lenEl ? parseInt(lenEl.textContent, 10) : 0;
      const mtime = modEl ? modEl.textContent : '';
      let name = nameEl && nameEl.textContent ? nameEl.textContent : href.replace(/\/$/, '').split('/').pop();
      items.push({ href, name, isDir, size: isNaN(size) ? 0 : size, mtime });
    }
    return items;
  }

  async function listDir(lib, relPath) {
    const url = fullUrl(lib, relPath);
    const urlObj = new URL(url);
    const res = await raw({
      url,
      method: 'PROPFIND',
      headers: { Authorization: authHeader(lib), Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' },
      body: PROPFIND_BODY
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`PROPFIND 실패 (${res.status}): ${relPath || '/'}`);
    }
    return parseMultistatus(res.data, urlObj.pathname);
  }

  async function getRange(url, headers, start, end) {
    const res = await raw({
      url,
      method: 'GET',
      headers: Object.assign({}, headers, { Range: `bytes=${start}-${end}` }),
      binary: true
    });
    if (res.status !== 206 && res.status !== 200) {
      throw new Error(`Range 요청 실패 (${res.status})`);
    }
    return bytesFromB64(res.data);
  }

  async function getFull(url, headers) {
    const res = await raw({ url, method: 'GET', headers, binary: true });
    if (res.status < 200 || res.status >= 300) throw new Error(`GET 실패 (${res.status})`);
    return bytesFromB64(res.data);
  }

  async function testConnection(lib) {
    const items = await listDir(lib, '');
    return items;
  }

  return { baseUrl, joinPath, fullUrl, authHeader, listDir, getRange, getFull, testConnection, b64FromBytes, bytesFromB64 };
})();
