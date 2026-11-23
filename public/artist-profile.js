import { loadSnapshot, photoUrl } from './content-store.js';
(async () => {
  const main = document.querySelector('.artist-profile');
  try {
    const artists = (await loadSnapshot('artists')).items;
    const artist = artists.find(item => item.id === new URLSearchParams(location.search).get('id'));
    if (!artist) throw new Error();
    document.title = artist.name + ' — 3М music';
    const image = (path, className = '') => {
      const img = document.createElement('img');
      img.src = photoUrl(path);
      img.width = 640;
      img.height = 640;
      img.alt = artist.name;
      img.className = className;
      return img;
    };
    const media = document.createElement('div');
    const heading = document.createElement('h1');
    heading.textContent = artist.name;
    media.append(heading);
    if (artist.logo) { heading.className = 'sr-only'; media.append(image(artist.logo, 'artist-logo')); }
    const gallery = document.createElement('div');
    gallery.className = 'artist-gallery';
    for (const path of artist.photos ?? []) gallery.append(image(path));
    media.append(gallery);
    function link(url, label, className) {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') return null;
      const a = document.createElement('a');
      a.href = parsed.href; a.textContent = label; a.className = className;
      a.target = '_blank'; a.rel = 'noopener noreferrer';
      return a;
    }
    if (artist.video) { const a = link(artist.video, '▶ Смотреть видео', 'video-link'); if (a) media.append(a); }
    const info = document.createElement('div');
    info.append(image(artist.photo, 'artist-main-photo'));
    const description = document.createElement('p');
    description.className = 'artist-description';
    description.textContent = artist.description;
    info.append(description);
    const links = document.createElement('nav');
    links.className = 'platform-links'; links.ariaLabel = 'Слушать';
    for (const item of artist.links ?? []) { const a = link(item.url, item.label, 'platform-link'); if (a) links.append(a); }
    info.append(links); main.replaceChildren(media, info);
  } catch {
    const heading = document.createElement('h1');
    heading.textContent = 'Артист не найден';
    const link = document.createElement('a');
    link.className = 'text-link';
    link.href = './artists.html';
    link.textContent = 'Вернуться к артистам';
    main.replaceChildren(heading, link);
  }
})();
