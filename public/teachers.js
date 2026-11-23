import { loadTeachers, teacherPhoto, teacherStorageKey } from './teacher-data.js';
async function renderTeachers() {
  try {
    const teachers = await loadTeachers();
    const cards = teachers.map(teacher => {
      const card = document.createElement('article');
      card.className = 'teacher panel';
      const title = document.createElement('h2');
      title.textContent = teacher.name;
      const content = document.createElement('div');
      content.className = 'teacher-copy';
      content.append(title);
      {
        const description = document.createElement('p');
        description.textContent = teacher.description || 'Информация о преподавателе готовится.';
        content.append(description);
      }
      card.append(content);
      const photo = teacherPhoto(teacher.photo);
      if (photo) {
        const image = document.createElement('img');
        image.src = photo;
        if (teacher.photo === 'assets/mikhail-grishin.webp') {
          image.srcset = teacherPhoto('assets/responsive/mikhail-grishin-160.webp') + ' 160w, ' + teacherPhoto('assets/responsive/mikhail-grishin-320.webp') + ' 320w, ' + photo + ' 640w';
          image.sizes = '(max-width: 767px) 42vw, 190px';
        }
        image.alt = teacher.name;
        image.loading = 'lazy';
        image.width = 640;
        image.height = 640;
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
