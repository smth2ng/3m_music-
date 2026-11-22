import { loadTeachers, teacherPhoto, teacherStorageKey } from '../teacher-data.js';

export async function setupTeachers() {
  const teachers = await loadTeachers();
  const list = document.querySelector('#teacher-admin-list');
  const form = document.querySelector('#teacher-editor');
  const preview = document.querySelector('#teacher-photo-preview');
  let selected;
  let previewUrl;
  list.replaceChildren();
  function showPhoto(path) {
    preview.hidden = !path;
    if (path) preview.src = path;
  }
  function render() {
    list.replaceChildren();
    for (const teacher of teachers) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = teacher.name;
      button.onclick = () => {
        selected = teacher;
        form.reset();
        form.hidden = false;
        form.elements.name.value = teacher.name;
        form.elements.description.value = teacher.description;
        showPhoto(teacherPhoto(teacher.photo));
        form.elements.name.focus();
      };
      list.append(button);
    }
  }
  form.onchange = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = undefined;
    const file = form.elements.photo.files[0];
    if (file) previewUrl = URL.createObjectURL(file);
    showPhoto(form.elements.removePhoto.checked ? '' : previewUrl ?? teacherPhoto(selected.photo));
  };
  form.onsubmit = async event => {
    event.preventDefault();
    const status = document.querySelector('#status');
    const submit = form.querySelector('[type=submit]');
    submit.disabled = true;
    try {
      const name = form.elements.name.value.trim();
      if (!name) throw new Error('Укажите имя преподавателя.');
      let photo = form.elements.removePhoto.checked ? '' : selected.photo;
      const file = form.elements.photo.files[0];
      if (file && !form.elements.removePhoto.checked) {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error('Выберите PNG, JPEG или WebP размером до 8 МБ.');
        photo = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Не удалось прочитать фото.'));
          reader.readAsDataURL(file);
        });
      }
      const updated = { ...selected, name, description: form.elements.description.value, photo };
      const next = teachers.map(teacher => teacher.id === selected.id ? updated : teacher);
      try { localStorage.setItem(teacherStorageKey, JSON.stringify({ teachers: next })); }
      catch { throw new Error('Не хватает места в браузере. Уменьшите фотографию.'); }
      teachers.splice(0, teachers.length, ...next);
      form.hidden = true;
      render();
      status.textContent = 'Преподаватель сохранён в этом браузере.';
    } catch (error) { status.textContent = error.message; }
    finally { submit.disabled = false; }
  };
  document.querySelector('#teacher-cancel').onclick = () => { form.hidden = true; };
  render();
}
