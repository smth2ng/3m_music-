export const teacherStorageKey = '3m-teachers-demo';
export async function loadTeachers() {
  const saved = localStorage.getItem(teacherStorageKey);
  if (saved) return JSON.parse(saved).teachers;
  const response = await fetch(new URL('./data/teachers.json', import.meta.url));
  if (!response.ok) throw new Error('Не удалось загрузить преподавателей.');
  return (await response.json()).teachers;
}
export function teacherPhoto(path) {
  if (/^data:image\/(png|jpeg|webp);base64,/.test(path ?? '')) return path;
  if (/^assets\/[a-zA-Z0-9/._-]+\.(png|jpe?g|webp)$/i.test(path ?? '') && !path.includes('..')) return new URL(path, import.meta.url).href;
  return '';
}
