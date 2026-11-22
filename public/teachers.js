import { loadTeachers, teacherPhoto, teacherStorageKey } from './teacher-data.js';
async function renderTeachers() {
  try {
    const teachers = await loadTeachers();
    const cards = teachers.map(teacher => {
      const card = document.createElement('article');
      card.className = 'teacher panel';
      const title = document.createElement('h3');
      title.textContent = teacher.name;
      const content = document.createElement('div');
      content.className = 'teacher-copy';
      content.append(title);
      if (teacher.description) {
        const description = document.createElement('p');
        description.textContent = teacher.description;
        content.append(description);
      }
      card.append(content);
      const photo = teacherPhoto(teacher.photo);
      if (photo) {
        const image = document.createElement('img');
        image.src = photo;
        image.alt = teacher.name;
        image.loading = 'lazy';
        card.append(image);
      }
      return card;
    });
    document.querySelector('.teacher-list').replaceChildren(...cards);
  } catch {
    // Keep the existing HTML cards available when local data cannot be read.
  }
}
renderTeachers();
window.addEventListener('storage', event => {
  if (event.key === teacherStorageKey || event.key === null) renderTeachers();
});
window.addEventListener('pageshow', event => { if (event.persisted) renderTeachers(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderTeachers(); });
