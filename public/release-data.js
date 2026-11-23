export const releaseStorageKey = '3m-releases-demo';
export async function readCollection(name, key) {
  const saved = localStorage.getItem(key);
  if (saved) return JSON.parse(saved)[name];
  const response = await fetch(new URL('./data/' + name + '.json', import.meta.url));
  if (!response.ok) throw new Error('Не удалось загрузить данные.');
  return (await response.json())[name];
}
export async function releaseArtists() {
  return [
    { id: 'artist-1', name: 'Артист 1' },
    { id: 'artist-2', name: 'Артист 2' },
    ...await readCollection('artists', '3m-artists-demo')
  ];
}
export function releasePhoto(path) {
  if (/^data:image\/(png|jpeg|webp);base64,/.test(path ?? '')) return path;
  if (/^assets\/[a-zA-Z0-9/._-]+\.(png|jpe?g|webp)$/i.test(path ?? '') && !path.includes('..')) return new URL(path, import.meta.url).href;
  return '';
}
export function listeningUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('Укажите HTTPS-ссылку для прослушивания.');
  return url.href;
}
