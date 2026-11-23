const collections = ['artists', 'teachers', 'releases'];
let remote = false;
export function configureStore(serverMode) { remote = serverMode; }
export const collectionKey = name => '3m-' + name + '-demo';
export function safePhoto(path) {
  if (typeof path !== 'string') return '';
  if (/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=\s]+$/.test(path)) return path;
  if (/^assets\/[a-zA-Z0-9/._-]+\.(png|jpe?g|webp)$/i.test(path) && !path.includes('..')) return path;
  return '';
}
export function photoUrl(path) {
  const safe = safePhoto(path);
  if (remote && safe.startsWith('assets/uploads/')) return '/api/admin/media?path=' + encodeURIComponent(safe);
  return safe.startsWith('data:') ? safe : safe ? new URL(safe, import.meta.url).href : '';
}
export function httpsUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('Укажите HTTPS-ссылку.');
  return url.href;
}
const text = value => typeof value === 'string' ? value : '';
export function normalizeCollection(name, records) {
  if (!Array.isArray(records)) return [];
  const seen = new Set();
  return records.flatMap(record => {
    if (!record || typeof record !== 'object' || typeof record.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(record.id) || seen.has(record.id)) return [];
    const title = text(name === 'releases' ? record.title : record.name).trim();
    if (!title) return [];
    const photo = safePhoto(record.photo);
    if (name !== 'teachers' && !photo) return [];
    seen.add(record.id);
    if (name === 'teachers') return [{ id: record.id, name: title, description: text(record.description), photo }];
    if (name === 'releases') {
      try {
        return [{ id: record.id, title, artistId: text(record.artistId), artistName: text(record.artistName), photo, url: httpsUrl(record.url) }];
      } catch { return []; }
    }
    const links = (Array.isArray(record.links) ? record.links : []).flatMap(link => {
      try { return link && text(link.label).trim() ? [{ label: link.label, url: httpsUrl(link.url) }] : []; }
      catch { return []; }
    });
    let video = '';
    try { if (record.video) video = httpsUrl(record.video); } catch {}
    return [{ id: record.id, name: title, photo, description: text(record.description), logo: safePhoto(record.logo), photos: (Array.isArray(record.photos) ? record.photos : []).map(safePhoto).filter(Boolean), video, links }];
  });
}
function rawLocal(name) {
  try { return localStorage.getItem(collectionKey(name)); }
  catch { return null; }
}
export async function github(path, method = 'GET', body) {
  const response = await fetch('/api/admin/github' + path, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store'
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Не удалось сохранить данные в GitHub.');
  return data;
}
export async function loadSnapshot(name) {
  if (!collections.includes(name)) throw new Error('Неизвестная коллекция.');
  if (remote) {
    const ref = await github('/git/ref/heads/main');
    const file = await github('/contents/public/data/' + name + '.json?ref=' + ref.object.sha);
    const bytes = Uint8Array.from(atob(file.content.replace(/\s/g, '')), char => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    const records = normalizeCollection(name, parsed[name]);
    return { items: records, revision: { head: ref.object.sha, content: file.sha },
      warning: !Array.isArray(parsed[name]) || records.length !== parsed[name].length ? 'В опубликованных данных пропущены повреждённые записи. Сохраните резервную копию перед правками.' : '' };
  }
  const raw = rawLocal(name);
  let warning = '';
  if (raw !== null) {
    try {
      const records = JSON.parse(raw)[name];
      const normalized = normalizeCollection(name, records);
      if (!Array.isArray(records) || normalized.length !== records.length) warning = 'Повреждённые записи пропущены. Сохраните резервную копию перед правками.';
      if (Array.isArray(records) && (!records.length || normalized.length)) return { items: normalized, revision: raw, warning };
    } catch {}
    warning = 'Локальные данные повреждены. Показана опубликованная версия. Сохраните резервную копию перед правками.';
  }
  const response = await fetch(new URL('./data/' + name + '.json', import.meta.url), { cache: 'no-cache' });
  if (!response.ok) throw new Error('Не удалось загрузить данные. Повторите попытку.');
  return { items: normalizeCollection(name, (await response.json())[name]), revision: raw, warning };
}
async function publish(name, items, revision) {
  const tree = [];
  const next = structuredClone(items);
  async function publishPhoto(value) {
    if (!value?.startsWith('data:')) return value;
    const [header, content] = value.split(',');
    const extension = header.includes('image/jpeg') ? 'jpg' : header.includes('image/png') ? 'png' : 'webp';
    const blob = await github('/git/blobs', 'POST', { content, encoding: 'base64' });
    const path = 'assets/uploads/' + crypto.randomUUID() + '.' + extension;
    tree.push({ path: 'public/' + path, mode: '100644', type: 'blob', sha: blob.sha });
    return path;
  }
  for (const item of next) {
    item.photo = await publishPhoto(item.photo);
    if (name === 'artists') {
      item.logo = await publishPhoto(item.logo);
      for (let i = 0; i < item.photos.length; i++) item.photos[i] = await publishPhoto(item.photos[i]);
    }
  }
  const commit = await github('/git/commits/' + revision);
  tree.push({ path: 'public/data/' + name + '.json', mode: '100644', type: 'blob', content: JSON.stringify({ [name]: next }, null, 2) + '\n' });
  const newTree = await github('/git/trees', 'POST', { base_tree: commit.tree.sha, tree });
  const saved = await github('/git/commits', 'POST', { message: 'Update ' + name + ' from administration', tree: newTree.sha, parents: [revision] });
  await github('/git/refs/heads/main', 'PATCH', { sha: saved.sha, force: false });
  return { items: next, revision: saved.sha };
}
export async function saveSnapshot(name, items, revision) {
  if (!collections.includes(name)) throw new Error('Неизвестная коллекция.');
  if (!Array.isArray(items)) throw new Error('Проверьте данные коллекции.');
  const normalized = normalizeCollection(name, items);
  if (normalized.length !== items.length) throw new Error('Проверьте данные. Есть некорректные или повторяющиеся записи.');
  const conflict = 'Данные изменились в другой вкладке. Нажмите «Обновить данные» и повторите правку.';
  if (remote) {
    const head = await github('/git/ref/heads/main');
    const current = await github('/contents/public/data/' + name + '.json?ref=' + head.object.sha);
    if (current.sha !== revision.content) throw new Error(conflict);
    const saved = await publish(name, normalized, head.object.sha);
    const file = await github('/contents/public/data/' + name + '.json?ref=' + saved.revision);
    return { items: saved.items, revision: { head: saved.revision, content: file.sha } };
  }
  const write = () => {
    if (rawLocal(name) !== revision) throw new Error(conflict);
    const value = JSON.stringify({ [name]: normalized });
    try { localStorage.setItem(collectionKey(name), value); }
    catch { throw new Error('Не хватает места в браузере. Сохраните резервную копию и уменьшите фотографии.'); }
    window.dispatchEvent(new CustomEvent('content-saved', { detail: name }));
    return { items: normalized, revision: value };
  };
  return navigator.locks ? navigator.locks.request('3m-content-' + name, write) : write();
}
export async function readImage(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error('Выберите PNG, JPEG или WebP размером до 8 МБ.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Не удалось прочитать фотографию.'));
    reader.readAsDataURL(file);
  });
}
export function saveMessage(name) {
  return remote ? name + ' сохранён в GitHub. Общий сайт обновится после публикации GitHub Actions.' : name + ' сохранён в этом браузере.';
}
