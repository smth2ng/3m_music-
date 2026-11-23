import { loadSnapshot, saveSnapshot, readImage, saveMessage } from '../content-store.js';
import { releaseArtists, releasePhoto, listeningUrl } from '../release-data.js';

export async function setupReleases() {
  const snapshot = await loadSnapshot('releases');
  let releases = snapshot.items;
  let revision = snapshot.revision;
  const form = document.querySelector('#release-editor');
  const list = document.querySelector('#release-admin-list');
  const preview = document.querySelector('#release-preview');
  const status = document.querySelector('#status');
  let editing = null;
  let previewUrl;
  let busy = false;
  async function persist(next) {
    const saved = await saveSnapshot('releases', next, revision);
    releases = saved.items;
    revision = saved.revision;
    form.hidden = true;
    render();
  }
  async function open(release = null) {
    if (busy) return;
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
      remove.onclick = async () => {
        if (busy || !confirm('Удалить релиз «' + release.title + '»?')) return;
        try { await persist(releases.filter(item => item.id !== release.id)); status.textContent = saveMessage('Список релизов'); }
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
      const artistName = fields.artist.selectedOptions[0]?.textContent;
      if (!artistId) throw new Error('Выберите артиста.');
      let photo = editing?.photo;
      const file = fields.photo.files[0];
      if (file) {
        photo = await readImage(file);
      }
      if (!photo) throw new Error('Добавьте обложку.');
      const release = { id: editing?.id ?? crypto.randomUUID(), title, artistId, artistName, photo, url };
      await persist(editing ? releases.map(item => item.id === editing.id ? release : item) : [release, ...releases]);
      status.textContent = saveMessage('Релиз');
    } catch (error) { status.textContent = error.message; }
    finally { busy = false; submit.disabled = false; }
  };
  render();
  return snapshot.warning;
}
