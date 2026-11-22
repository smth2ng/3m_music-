const demoMode = true;
const demoKey = '3m-artists-demo';
const apiRoot = '/api/admin/github';
const editor = document.querySelector('#editor');
const status = document.querySelector('#status');
let artists = [];
let head = '';
let editing = null;
let retainedPhotos = [];
let busy = false;
async function api(path, method = 'GET', body) {
  const response = await fetch(apiRoot + path, {
    method,
    headers: { Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store'
  });
  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    let advice = 'Проверьте соединение и настройки сервера.';
    if (response.status === 403) {
      advice = 'Проверьте на сервере разрешение токена Contents — Read and write и ограничения ветки main.';
      if (response.headers.get('x-ratelimit-remaining') === '0') {
        advice = 'Лимит запросов GitHub исчерпан. Повторите сохранение после восстановления лимита.';
      }
    }
    if (response.status === 401) advice = 'Войдите по паролю. Если ошибка повторяется после входа, проверьте серверный токен GitHub.';
    throw new Error('GitHub ' + response.status + ' (' + method + ' ' + path.split('?')[0] + '). ' + (details.message ? details.message + '. ' : '') + advice);
  }
  return response.json();
}
async function load() {
  if (demoMode) {
    const saved = localStorage.getItem(demoKey);
    const response = saved ? null : await fetch('../data/artists.json');
    if (response && !response.ok) throw new Error('Не удалось загрузить артистов.');
    artists = saved ? JSON.parse(saved).artists : (await response.json()).artists;
    return;
  }
  const ref = await api('/git/ref/heads/main');
  head = ref.object.sha;
  const file = await api('/contents/public/data/artists.json?ref=' + head);
  const bytes = Uint8Array.from(atob(file.content.replace(/\s/g, '')), char => char.charCodeAt(0));
  artists = JSON.parse(new TextDecoder().decode(bytes)).artists;
}
function render() {
  const list = document.querySelector('#artist-list');
  list.replaceChildren();
  for (const artist of artists) {
    const button = document.createElement('button');
    button.type = 'button';
    const photo = document.createElement('img');
    photo.src = artist.photo.startsWith('data:image/') ? artist.photo : '../' + artist.photo;
    photo.alt = '';
    const title = document.createElement('span');
    title.textContent = artist.name;
    button.append(photo, title);
    button.addEventListener('click', () => open(artist));
    list.append(button);
  }
}
function open(artist = null) {
  editing = artist;
  editor.reset();
  editor.hidden = false;
  editor.elements.name.value = artist?.name ?? '';
  editor.elements.description.value = artist?.description ?? '';
  editor.elements.video.value = artist?.video ?? '';
  editor.elements.links.value = (artist?.links ?? []).map(link => link.label + ' | ' + link.url).join('\n');
  document.querySelector('#editor-title').textContent = artist ? 'Редактировать артиста' : 'Новый артист';
  document.querySelector('#delete').hidden = !artist;
  const preview = document.querySelector('#photo-preview');
  preview.hidden = !artist;
  preview.src = artist ? (artist.photo.startsWith('data:image/') ? artist.photo : '../' + artist.photo) : '';
  retainedPhotos = [...(artist?.photos ?? [])];
  const gallery = document.querySelector('#gallery-list');
  gallery.replaceChildren();
  for (const path of retainedPhotos) {
    const label = document.createElement('label');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = true;
    check.addEventListener('change', () => {
      retainedPhotos = check.checked ? [...retainedPhotos, path] : retainedPhotos.filter(photo => photo !== path);
    });
    const image = document.createElement('img');
    image.src = path.startsWith('data:image/') ? path : '../' + path;
    image.alt = 'Сохранить фотографию';
    image.className = 'admin-preview';
    label.append(check, image);
    gallery.append(label);
  }
  updatePreview();
  editor.elements.name.focus();
}
async function task(action) {
  if (busy) return;
  busy = true;
  document.querySelectorAll('button').forEach(button => { button.disabled = true; });
  try { await action(); }
  catch (error) { status.textContent = error.message; }
  finally {
    busy = false;
    document.querySelectorAll('button').forEach(button => { button.disabled = false; });
  }
}
function https(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('Используйте HTTPS-ссылки.');
  return url.href;
}
async function upload(file, tree) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error('Фото должно быть PNG, JPEG или WebP размером до 8 МБ.');
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('Не удалось прочитать фотографию.'));
    reader.readAsDataURL(file);
  });
  if (demoMode) return 'data:' + file.type + ';base64,' + data;
  const blob = await api('/git/blobs', 'POST', { content: data, encoding: 'base64' });
  const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[file.type];
  const path = 'assets/uploads/' + crypto.randomUUID() + '.' + extension;
  tree.push({ path: 'public/' + path, mode: '100644', type: 'blob', sha: blob.sha });
  return path;
}
async function save(next, tree) {
  if (demoMode) {
    try { localStorage.setItem(demoKey, JSON.stringify({ artists: next })); }
    catch { throw new Error('Не хватает места в браузере. Уменьшите размер фотографий.'); }
    artists = next;
    editor.hidden = true;
    render();
    status.textContent = 'Сохранено в этом браузере. Общий сайт не изменён.';
    return;
  }
  // A non-forced reference update rejects concurrent edits instead of overwriting them.
  const commit = await api('/git/commits/' + head);
  tree.push({ path: 'public/data/artists.json', mode: '100644', type: 'blob', content: JSON.stringify({ artists: next }, null, 2) + '\n' });
  const newTree = await api('/git/trees', 'POST', { base_tree: commit.tree.sha, tree });
  const newCommit = await api('/git/commits', 'POST', { message: 'Update artists from admin panel', tree: newTree.sha, parents: [head] });
  await api('/git/refs/heads/main', 'PATCH', { sha: newCommit.sha, force: false });
  head = newCommit.sha;
  artists = next;
  editor.hidden = true;
  render();
  status.textContent = 'Сохранено в GitHub. Сайт обновится после успешной публикации GitHub Actions.';
}
document.querySelector('#login').addEventListener('submit', event => {
  event.preventDefault();
  task(async () => {
    if (demoMode) {
      if (document.querySelector('#password').value !== '6767') throw new Error('Неверный пароль.');
    } else {
    const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: document.querySelector('#password').value }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message);
    }
    await load();
    document.querySelector('#password').value = '';
    document.querySelector('#login').hidden = true;
    document.querySelector('#workspace').hidden = false;
    render();
    status.textContent = 'Данные загружены.';
  });
});
document.querySelector('#new').onclick = () => open();
document.querySelector('#cancel').onclick = () => { editor.hidden = true; };
document.querySelector('#logout').onclick = () => task(async () => {
  if (!demoMode) {
  const response = await fetch('/api/admin/logout', { method: 'POST' });
  if (!response.ok && response.status !== 401) throw new Error('Не удалось завершить сеанс. Повторите выход.');
  }
  artists = [];
  editing = null;
  editor.reset();
  editor.hidden = true;
  document.querySelector('#workspace').hidden = true;
  document.querySelector('#login').hidden = false;
  status.textContent = 'Вы вышли.';
});
editor.addEventListener('submit', event => {
  event.preventDefault();
  task(async () => {
    const fields = editor.elements;
    const links = fields.links.value.split('\n').filter(line => line.trim()).map(line => {
      const separator = line.indexOf('|');
      if (separator < 1) throw new Error('Укажите платформу и ссылку через |.');
      const label = line.slice(0, separator).trim();
      if (!label) throw new Error('Укажите название платформы.');
      return { label, url: https(line.slice(separator + 1).trim()) };
    });
    const name = fields.name.value.trim();
    if (!name) throw new Error('Укажите название артиста.');
    const video = fields.video.value.trim() ? https(fields.video.value.trim()) : '';
    if (!editing && !fields.photo.files.length) throw new Error('Добавьте главное фото.');
    status.textContent = 'Сохраняем…';
    const tree = [];
    const photo = fields.photo.files.length ? await upload(fields.photo.files[0], tree) : editing.photo;
    let logo = fields.removeLogo.checked ? '' : editing?.logo ?? '';
    if (fields.logo.files.length) logo = await upload(fields.logo.files[0], tree);
    const photos = [...retainedPhotos];
    for (const file of fields.photos.files) photos.push(await upload(file, tree));
    const artist = { id: editing?.id ?? 'artist-' + crypto.randomUUID(), name, description: fields.description.value, photo, logo, photos, video, links };
    const next = editing ? artists.map(item => item.id === editing.id ? artist : item) : [...artists, artist];
    await save(next, tree);
  });
});
document.querySelector('#delete').onclick = () => {
  if (!editing || !confirm('Удалить артиста «' + editing.name + '» с сайта?')) return;
  task(() => save(artists.filter(artist => artist.id !== editing.id), []));
};


let previewUrls = [];
function updatePreview() {
  previewUrls.forEach(url => URL.revokeObjectURL(url));
  previewUrls = [];
  function fileUrl(file) {
    const url = URL.createObjectURL(file);
    previewUrls.push(url);
    return url;
  }
  const fields = editor.elements;
  const source = path => path?.startsWith('data:image/') ? path : '../' + path;
  for (const [name, selector] of [['photo', '#photo-preview'], ['logo', '#logo-preview']]) {
    const image = document.querySelector(selector);
    const path = fields[name].files[0] ? fileUrl(fields[name].files[0]) : editing?.[name];
    image.hidden = !path || (name === 'logo' && fields.removeLogo.checked);
    if (path) image.src = path.startsWith('blob:') ? path : source(path);
  }
  const gallery = document.querySelector('#new-gallery');
  gallery.replaceChildren();
  for (const file of fields.photos.files) {
    const image = document.createElement('img');
    image.src = fileUrl(file);
    image.alt = 'Новая фотография';
    gallery.append(image);
  }
  const video = document.querySelector('#video-preview');
  video.hidden = true;
  try { video.href = https(fields.video.value); video.hidden = false; } catch {}
  const links = document.querySelector('#links-preview');
  links.replaceChildren();
  for (const line of fields.links.value.split('\n')) {
    const index = line.indexOf('|');
    if (index < 1) continue;
    try {
      const link = document.createElement('a');
      link.href = https(line.slice(index + 1).trim());
      link.textContent = line.slice(0, index).trim() + ' ↗';
      link.className = 'platform-link';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      links.append(link);
    } catch {}
  }
}
editor.addEventListener('input', updatePreview);
editor.addEventListener('change', updatePreview);
