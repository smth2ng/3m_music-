import { loadSnapshot, photoUrl } from './content-store.js';
let renderVersion = 0;
async function refreshArtists() {
  const version = ++renderVersion;
  try {
    const { items: artists } = await loadSnapshot('artists');
    if (version !== renderVersion) return;
    const grid = document.querySelector('.artists-grid');
    const carousel = document.querySelector('.artists');
    document.querySelectorAll('[data-managed-artist]').forEach(card => card.remove());
    for (const artist of artists) {
      const card = document.createElement('a');
      card.dataset.managedArtist = artist.id;
      card.href = './artist.html?id=' + encodeURIComponent(artist.id);
      const image = document.createElement('img');
      image.src = photoUrl(artist.photo);
      image.alt = grid ? '' : artist.name;
      image.loading = 'lazy';
      image.draggable = false;
      image.width = 640;
      image.height = 640;
      card.append(image);
      if (grid) {
        card.className = 'artist-tile panel';
        const name = document.createElement('h2');
        name.textContent = artist.name;
        card.append(name);
        grid.append(card);
      } else if (carousel) {
        card.className = 'artist';
        card.target = '_blank';
        card.rel = 'noopener noreferrer';
        card.hidden = true;
        const overlay = document.createElement('span');
        overlay.className = 'artist-overlay';
        card.append(overlay);
        carousel.insertBefore(card, document.querySelector('#carousel-status'));
      }
    }
    const empty = document.querySelector('#artists-empty');
    if (empty) empty.hidden = artists.length > 0;
    document.dispatchEvent(new Event('artists-updated'));
  } catch {
    // Keep server-rendered cards available when the published data cannot be loaded.
  }
}
refreshArtists();
window.addEventListener('storage', event => {
  if (event.key === '3m-artists-demo' || event.key === null) refreshArtists();
});
window.addEventListener('pageshow', event => { if (event.persisted) refreshArtists(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshArtists(); });
