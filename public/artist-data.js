// Demo data is scoped to the current browser and overrides the published snapshot.
(() => {
  let artists;
  try {
    const saved = localStorage.getItem('3m-artists-demo');
    if (!saved) return;
    artists = JSON.parse(saved).artists;
    if (!Array.isArray(artists)) return;
  } catch { return; }
  const imageUrl = path => {
    if (/^data:image\/(png|jpeg|webp);base64,/.test(path ?? '')) return path;
    if (/^assets\/uploads\/[a-zA-Z0-9._-]+\.(png|jpe?g|webp)$/i.test(path ?? '')) return './' + path;
    return '';
  };
  const grid = document.querySelector('.artists-grid');
  const carousel = document.querySelector('.artists');
  document.querySelectorAll('[data-managed-artist]').forEach(card => card.remove());
  for (const artist of artists) {
    if (!artist.id || !artist.name || !imageUrl(artist.photo)) continue;
    const card = document.createElement('a');
    card.dataset.managedArtist = artist.id;
    card.href = './artist.html?id=' + encodeURIComponent(artist.id);
    const image = document.createElement('img');
    image.src = imageUrl(artist.photo);
    image.alt = artist.name;
    image.loading = 'lazy';
    image.draggable = false;
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
  const status = document.querySelector('#carousel-status');
  if (status) status.textContent = 'Карточка 1 из ' + document.querySelectorAll('.artist').length;
})();
