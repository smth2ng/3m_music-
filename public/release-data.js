import { loadSnapshot, photoUrl, httpsUrl } from './content-store.js';
export const releaseStorageKey = '3m-releases-demo';
export async function readCollection(name) {
  return (await loadSnapshot(name)).items;
}
export async function releaseArtists() {
  return readCollection('artists');
}
export const releasePhoto = photoUrl;
export const listeningUrl = httpsUrl;
