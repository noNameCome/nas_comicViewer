const SettingsForm = (() => {
  let editingId = null;

  function q(id) { return document.getElementById(id); }

  function fields() {
    return {
      name: q('f-name'),
      https: q('f-https'),
      host: q('f-host'),
      port: q('f-port'),
      path: q('f-path'),
      username: q('f-username'),
      password: q('f-password')
    };
  }

  function openNew() {
    editingId = null;
    const f = fields();
    f.name.value = '';
    f.https.checked = false;
    f.host.value = '';
    f.port.value = '';
    f.path.value = '/';
    f.username.value = '';
    f.password.value = '';
    q('form-title').textContent = '경로 추가';
    q('form-delete').style.display = 'none';
    App.showScreen('form-screen');
  }

  function openEdit(lib) {
    editingId = lib.id;
    const f = fields();
    f.name.value = lib.name;
    f.https.checked = !!lib.https;
    f.host.value = lib.host;
    f.port.value = lib.port || '';
    f.path.value = lib.path || '/';
    f.username.value = lib.username || '';
    f.password.value = lib.password || '';
    q('form-title').textContent = '경로 수정';
    q('form-delete').style.display = 'block';
    App.showScreen('form-screen');
  }

  function collect() {
    const f = fields();
    const host = f.host.value.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    return {
      id: editingId || Store.uid(),
      name: f.name.value.trim() || host,
      https: f.https.checked,
      host,
      port: f.port.value.trim(),
      path: f.path.value.trim() || '/',
      username: f.username.value,
      password: f.password.value
    };
  }

  async function save() {
    const lib = collect();
    if (!lib.host) { App.toast('호스트 주소를 입력해주세요'); return; }
    q('form-save').disabled = true;
    q('form-save').textContent = '연결 확인 중...';
    try {
      await Webdav.testConnection(lib);
    } catch (e) {
      q('form-save').disabled = false;
      q('form-save').textContent = '저장';
      App.toast('연결 실패: ' + e.message);
      return;
    }
    q('form-save').disabled = false;
    q('form-save').textContent = '저장';
    await Store.upsertLibrary(lib);
    await App.reloadLibraries();
    App.showScreen('lib-screen');
  }

  async function del() {
    if (!editingId) return;
    await Store.deleteLibrary(editingId);
    await App.reloadLibraries();
    App.showScreen('lib-screen');
  }

  function init() {
    q('form-save').addEventListener('click', save);
    q('form-cancel').addEventListener('click', () => App.showScreen('lib-screen'));
    q('form-delete').addEventListener('click', del);
    q('f-https').addEventListener('change', e => {
      if (!q('f-port').value) q('f-port').placeholder = e.target.checked ? '443' : '80';
    });
  }

  return { init, openNew, openEdit };
})();
