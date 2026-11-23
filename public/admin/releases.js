import { readCollection, releaseArtists, releaseStorageKey, releasePhoto, listeningUrl } from '../release-data.js';

export async function setupReleases() {
  let releases = await readCollection('releases', releaseStorageKey);
  const form = document.querySelector('#release-editor');
  const list = document.querySelector('#release-admin-list');
  const preview = document.querySelector('#release-preview');
  const status = document.querySelector('#status');
  let editing = null;
  let previewUrl;
  let busy = false;
  function persist(next) {
    try { localStorage.setItem(releaseStorageKey, JSON.stringify({ releases: next })); }
    catch { throw new Error('Не хватает места в браузере. Уменьшите обложку.'); }
    releases = next;
    form.hidden = true;
    render();
  }
  async function open(release = null) {
    editing = release;
    form.reset();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = undefined;
    const artists = await releaseArtists();
    const select = form.elements.artist;
    select.replaceChildren();
    for (const artist of artists) select.add(new Option(artist.name, artist.id));
    if (release && !artists.some(artist => artist.id === release.artistId)) {
      select.add(new Option(release.artistName + ' (удалён)', release.artistId));
    }
    if (release) select.value = release.artistId;
    form.elements.title.value = release?.title ?? '';
    form.elements.url.value = release?.url ?? '';
    preview.hidden = !release;
    if (release) preview.src = releasePhoto(release.photo);
    document.querySelector('#release-editor-title').textContent = release ? 'Редактировать релиз' : 'Новый релиз';
    form.hidden = false;
    form.elements.title.focus();
  }
  function render() {
    list.replaceChildren();
    for (const release of releases) {
      const row = document.createElement('div');
      row.className = 'teacher-admin-row panel';
      const title = document.createElement('strong');
      title.textContent = release.title;
      const edit = document.createElement('button');
      edit.type = 'button'; edit.textContent = 'Редактировать';
      edit.setAttribute('aria-label', 'Редактировать релиз — ' + release.title);
      edit.onclick = () => open(release).catch(error => { status.textContent = error.message; });
      const remove = document.createElement('button');
      remove.type = 'button'; remove.textContent = 'Удалить';
      remove.setAttribute('aria-label', 'Удалить релиз — ' + release.title);
      remove.onclick = () => {
        if (!confirm('Удалить релиз «' + release.title + '»?')) return;
        try { persist(releases.filter(item => item.id !== release.id)); status.textContent = 'Релиз удалён в этом браузере.'; }
        catch (error) { status.textContent = error.message; }
      };
      row.append(title, edit, remove);
      list.append(row);
    }
  }
  document.querySelector('#release-new').onclick = () => open().catch(error => { status.textContent = error.message; });
  document.querySelector('#release-cancel').onclick = () => { form.hidden = true; };
  form.elements.photo.onchange = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const file = form.elements.photo.files[0];
    previewUrl = file ? URL.createObjectURL(file) : undefined;
    preview.hidden = !previewUrl && !editing;
    if (!preview.hidden) preview.src = previewUrl ?? releasePhoto(editing.photo);
  };
  form.onsubmit = async event => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    const submit = form.querySelector('[type=submit]');
    submit.disabled = true;
    try {
      const fields = form.elements;
      const title = fields.title.value.trim();
      if (!title) throw new Error('Укажите название релиза.');
      const url = listeningUrl(fields.url.value.trim());
      const artistId = fields.artist.value;
      if (!artistId) throw new Error('Выберите артиста.');
      let photo = editing?.photo;
      const file = fields.photo.files[0];
      if (file) {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error('Обложка должна быть PNG, JPEG или WebP до 8 МБ.');
        photo = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Не удалось прочитать обложку.'));
          reader.readAsDataURL(file);
        });
      }
      if (!photo) throw new Error('Добавьте обложку.');
      const release = { id: editing?.id ?? crypto.randomUUID(), title, artistId, artistName: fields.artist.selectedOptions[0].textContent, photo, url };
      persist(editing ? releases.map(item => item.id === editing.id ? release : item) : [release, ...releases]);
      status.textContent = 'Релиз сохранён в этом браузере.';
    } catch (error) { status.textContent = error.message; }
    finally { busy = false; submit.disabled = false; }
  };
  render();
}
