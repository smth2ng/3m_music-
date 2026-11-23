import { setupReleases } from './releases.js';
import { setupTeachers } from './teachers.js';
import { serverMode } from './config.js';
import { configureStore, loadSnapshot, saveSnapshot, readImage, photoUrl, httpsUrl, saveMessage } from '../content-store.js';
const editor = document.querySelector('#editor');
const status = document.querySelector('#status');
let artists = [];
let revision = null;
let editing = null;
let retainedPhotos = [];
let busy = false;
async function load() {
  const snapshot = await loadSnapshot('artists');
  artists = snapshot.items;
  revision = snapshot.revision;
  return snapshot.warning;
}
function render() {
  const list = document.querySelector('#artist-list');
  list.replaceChildren();
  for (const artist of artists) {
    const button = document.createElement('button');
    button.type = 'button';
    const photo = document.createElement('img');
    photo.src = photoUrl(artist.photo);
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
  if (artist) preview.src = photoUrl(artist.photo);
  else preview.removeAttribute('src');
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
    image.src = photoUrl(path);
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
const https = httpsUrl;
async function save(next) {
  const saved = await saveSnapshot('artists', next, revision);
  artists = saved.items;
  revision = saved.revision;
  editor.hidden = true;
  render();
  status.textContent = saveMessage('Артист');
}
async function refresh() {
  editor.hidden = true;
  document.querySelector('#teacher-editor').hidden = true;
  document.querySelector('#release-editor').hidden = true;
  const warnings = [await load(), await setupTeachers(), await setupReleases()].filter(Boolean);
  document.querySelector('#storage-warning').textContent = warnings.join(' ');
  render();
}
document.querySelector('#login').addEventListener('submit', event => {
  event.preventDefault();
  task(async () => {
    if (!serverMode) {
      if (document.querySelector('#password').value !== '6767') throw new Error('Неверный пароль.');
    } else {
    const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: document.querySelector('#password').value }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message);
    }
    configureStore(serverMode);
    await refresh();
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
  if (serverMode) {
  const response = await fetch('/api/admin/logout', { method: 'POST' });
  if (!response.ok && response.status !== 401) throw new Error('Не удалось завершить сеанс. Повторите выход.');
  }
  artists = [];
  editing = null;
  editor.reset();
  editor.hidden = true;
  document.querySelector('#teacher-editor').hidden = true;
  document.querySelector('#release-editor').hidden = true;
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
    const photo = fields.photo.files.length ? await readImage(fields.photo.files[0]) : editing.photo;
    let logo = fields.removeLogo.checked ? '' : editing?.logo ?? '';
    if (fields.logo.files.length) logo = await readImage(fields.logo.files[0]);
    const photos = [...retainedPhotos];
    for (const file of fields.photos.files) photos.push(await readImage(file));
    const artist = { id: editing?.id ?? 'artist-' + crypto.randomUUID(), name, description: fields.description.value, photo, logo, photos, video, links };
    const next = editing ? artists.map(item => item.id === editing.id ? artist : item) : [...artists, artist];
    await save(next);
  });
});
document.querySelector('#delete').onclick = () => {
  if (!editing || !confirm('Удалить артиста «' + editing.name + '» с сайта?')) return;
  task(() => save(artists.filter(artist => artist.id !== editing.id)));
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
  const source = photoUrl;
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
      link.textContent = line.slice(0, index).trim();
      link.className = 'platform-link';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      links.append(link);
    } catch {}
  }
}
editor.addEventListener('input', updatePreview);
editor.addEventListener('change', updatePreview);

document.querySelector('#reload-data').onclick = () => task(async () => {
  if (!confirm('Обновить данные? Несохранённые поля формы будут сброшены.')) return;
  await refresh();
  status.textContent = 'Данные обновлены.';
});
document.querySelector('#backup-data').onclick = () => task(async () => {
  const data = {};
  for (const name of ['artists', 'teachers', 'releases']) {
    const snapshot = await loadSnapshot(name);
    data[name] = !serverMode && localStorage.getItem('3m-' + name + '-demo') !== null
      ? localStorage.getItem('3m-' + name + '-demo')
      : JSON.stringify({ [name]: snapshot.items });
  }
  const blob = new Blob([JSON.stringify({ version: 1, data }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = '3m-music-backup.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
document.querySelector('#restore-data').onclick = () => task(async () => {
  const file = document.querySelector('#restore-file').files[0];
  if (!file || file.size > 20 * 1024 * 1024) throw new Error('Выберите JSON-копию размером до 20 МБ.');
  const name = document.querySelector('#restore-collection').value;
  let items;
  try {
    const backup = JSON.parse(await file.text());
    if (backup.version !== 1 || typeof backup.data[name] !== 'string') throw new Error();
    items = JSON.parse(backup.data[name])[name];
    if (!Array.isArray(items)) throw new Error();
  } catch { throw new Error('Файл не содержит корректной копии выбранного раздела.'); }
  if (!confirm('Заменить выбранный раздел данными из копии? Текущие записи этого раздела будут заменены.')) return;
  const snapshot = await loadSnapshot(name);
  await saveSnapshot(name, items, snapshot.revision);
  await refresh();
  status.textContent = 'Выбранный раздел восстановлен.';
});
document.querySelector('#admin-mode').textContent = serverMode
  ? 'Серверный режим. Сохранение публикует данные через GitHub.'
  : 'Деморежим. Изменения сохраняются только в этом браузере. Пароль проверяется в коде страницы.';
