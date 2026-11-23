import { teacherPhoto } from '../teacher-data.js';
import { loadSnapshot, saveSnapshot, readImage, saveMessage } from '../content-store.js';

export async function setupTeachers() {
  const snapshot = await loadSnapshot('teachers');
  let teachers = snapshot.items;
  let revision = snapshot.revision;
  const list = document.querySelector('#teacher-admin-list');
  const form = document.querySelector('#teacher-editor');
  const preview = document.querySelector('#teacher-photo-preview');
  let selected;
  let busy = false;
  let previewUrl;
  list.replaceChildren();
  function showPhoto(path) {
    preview.hidden = !path;
    if (path) preview.src = path;
  }
  function openTeacher(teacher = null) {
    if (busy) return;
    selected = teacher;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = undefined;
    form.reset();
    form.hidden = false;
    form.elements.name.value = teacher?.name ?? '';
    form.elements.description.value = teacher?.description ?? '';
    showPhoto(teacherPhoto(teacher?.photo));
    document.querySelector('#teacher-editor-title').textContent = teacher ? 'Редактировать преподавателя' : 'Новый преподаватель';
    document.querySelector('#teacher-delete').hidden = !teacher;
    form.elements.name.focus();
  }
  async function persist(next) {
    const saved = await saveSnapshot('teachers', next, revision);
    teachers = saved.items;
    revision = saved.revision;
    form.hidden = true;
    render();
  }
  function render() {
    list.replaceChildren();
    for (const teacher of teachers) {
      const row = document.createElement('div');
      row.className = 'teacher-admin-row panel';
      const name = document.createElement('strong');
      name.textContent = teacher.name;
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = 'Редактировать';
      edit.setAttribute('aria-label', 'Редактировать — ' + teacher.name);
      edit.onclick = () => openTeacher(teacher);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Удалить';
      remove.setAttribute('aria-label', 'Удалить — ' + teacher.name);
      remove.onclick = () => deleteTeacher(teacher);
      row.append(name, edit, remove);
      list.append(row);
    }
  }
  form.onchange = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = undefined;
    const file = form.elements.photo.files[0];
    if (file) previewUrl = URL.createObjectURL(file);
    showPhoto(form.elements.removePhoto.checked ? '' : previewUrl ?? teacherPhoto(selected?.photo));
  };
  form.onsubmit = async event => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    const status = document.querySelector('#status');
    const submit = form.querySelector('[type=submit]');
    submit.disabled = true;
    try {
      const name = form.elements.name.value.trim();
      if (!name) throw new Error('Укажите имя преподавателя.');
      let photo = form.elements.removePhoto.checked ? '' : selected?.photo ?? '';
      const file = form.elements.photo.files[0];
      if (file && !form.elements.removePhoto.checked) {
        photo = await readImage(file);
      }
      const updated = { id: selected?.id ?? 'teacher-' + crypto.randomUUID(), name, description: form.elements.description.value, photo };
      const next = selected ? teachers.map(teacher => teacher.id === selected.id ? updated : teacher) : [...teachers, updated];
      await persist(next);
      status.textContent = saveMessage('Преподаватель');
    } catch (error) { status.textContent = error.message; }
    finally { busy = false; submit.disabled = false; }
  };
  document.querySelector('#teacher-new').onclick = () => openTeacher();
  async function deleteTeacher(teacher) {
    if (busy || !confirm('Удалить преподавателя «' + teacher.name + '»?')) return;
    try {
      await persist(teachers.filter(item => item.id !== teacher.id));
      document.querySelector('#status').textContent = saveMessage('Список преподавателей');
    } catch (error) { document.querySelector('#status').textContent = error.message; }
  }
  document.querySelector('#teacher-delete').onclick = () => {
    if (selected) deleteTeacher(selected);
  };
  document.querySelector('#teacher-cancel').onclick = () => { form.hidden = true; };
  render();
  return snapshot.warning;
}
