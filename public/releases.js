import { readCollection, releaseArtists, releaseStorageKey, releasePhoto, listeningUrl } from './release-data.js';
async function renderReleases() {
  const list = document.querySelector('#release-list');
  try {
    const [releases, artists] = await Promise.all([readCollection('releases', releaseStorageKey), releaseArtists()]);
    const cards = releases.map(release => {
      const card = document.createElement('article');
      card.className = 'release-card panel';
      const image = document.createElement('img');
      image.src = releasePhoto(release.photo);
      image.alt = 'Обложка — ' + release.title;
      image.loading = 'lazy';
      const artist = document.createElement('p');
      artist.textContent = artists.find(item => item.id === release.artistId)?.name ?? release.artistName;
      const title = document.createElement('h3');
      title.textContent = release.title;
      const link = document.createElement('a');
      link.className = 'platform-link';
      link.href = listeningUrl(release.url);
      link.textContent = 'Слушать ↗';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      card.append(image, artist, title, link);
      return card;
    });
    list.replaceChildren(...cards);
    document.querySelector('#releases-empty').hidden = cards.length > 0;
  } catch { document.querySelector('#releases-empty').textContent = 'Не удалось загрузить релизы.'; }
}
renderReleases();
window.addEventListener('storage', event => {
  if ([releaseStorageKey, '3m-artists-demo', null].includes(event.key)) renderReleases();
});
window.addEventListener('pageshow', event => { if (event.persisted) renderReleases(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderReleases(); });
