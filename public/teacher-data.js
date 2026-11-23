import { loadSnapshot, photoUrl } from './content-store.js';
export const teacherStorageKey = '3m-teachers-demo';
export async function loadTeachers() { return (await loadSnapshot('teachers')).items; }
export const teacherPhoto = photoUrl;
