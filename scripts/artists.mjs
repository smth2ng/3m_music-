import { readFile, writeFile } from 'node:fs/promises';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function imagePath(value) {
  if (!/^assets\/uploads\/[a-zA-Z0-9._-]+\.(png|jpe?g|webp)$/i.test(value ?? '')) throw new Error('Invalid artist image path');
  return value;
}
function httpsUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('Artist links must use HTTPS');
  return url.href;
}
export async function buildArtists() {
  const { artists } = JSON.parse(await readFile('public/data/artists.json', 'utf8'));
  const home = await readFile('public/index.html', 'utf8');
  const header = home.match(/<header class="site-header">[\s\S]*?<\/header>/)[0].replaceAll('./', '../').replace(' aria-current="page"', '');
  const footer = home.match(/<footer class="footer">[\s\S]*?<\/footer>/)[0].replaceAll('./', '../');
  const seen = new Set(['artist-1', 'artist-2']);
  let cards = '';
  for (const artist of artists) {
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(artist.id) || seen.has(artist.id)) throw new Error('Invalid or duplicate artist ID');
    seen.add(artist.id);
    if (!artist.name?.trim()) throw new Error('Artist name is required');
    const photo = imagePath(artist.photo);
    const gallery = (artist.photos ?? []).map(path => `<img src="../${escape(imagePath(path))}" alt="${escape(artist.name)}" loading="lazy">`).join('');
    const links = (artist.links ?? []).map(link => `<a class="platform-link" href="${escape(httpsUrl(link.url))}" target="_blank" rel="noopener noreferrer"><span>${escape(link.label)}</span><span aria-hidden="true">↗</span></a>`).join('');
    const video = artist.video ? `<a class="video-link panel" href="${escape(httpsUrl(artist.video))}" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">▶</span> Смотреть видео <span aria-hidden="true">↗</span></a>` : '';
    const title = artist.logo ? `<h1 class="sr-only">${escape(artist.name)}</h1><img class="artist-logo" src="../${escape(imagePath(artist.logo))}" alt="${escape(artist.name)}">` : `<h1>${escape(artist.name)}</h1>`;
    await writeFile(`dist/artists/${artist.id}.html`, `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(artist.name)} — 3М music</title><meta name="description" content="${escape(artist.description)}"><link rel="icon" href="../assets/logo.svg"><link rel="stylesheet" href="../style.css"></head><body><div class="site-shell">${header}<main class="artist-profile"><div class="artist-media">${title}<div class="artist-gallery">${gallery}</div>${video}</div><div class="artist-info"><img class="artist-main-photo" src="../${escape(photo)}" alt="${escape(artist.name)}"><p class="artist-description">${escape(artist.description)}</p><nav class="platform-links" aria-label="Слушать ${escape(artist.name)}">${links}</nav></div></main>${footer}</div></body></html>`);
    cards += `<a href="./artists/${artist.id}.html" target="_blank" rel="noopener noreferrer" class="artist" data-artist="${seen.size - 1}" aria-label="Открыть страницу ${escape(artist.name)}"><img src="./${escape(photo)}" alt="${escape(artist.name)}" loading="lazy" draggable="false"><span class="artist-overlay"></span></a>`;
  }
  for (const file of ['index.html', 'artists.html']) {
    const path = `dist/${file}`;
    let html = await readFile(path, 'utf8');
    html = html.replace('<span class="sr-only" id="carousel-status"', cards + '<span class="sr-only" id="carousel-status"');
    html = html.replace('Карточка 1 из 2</span>', `Карточка 1 из ${artists.length + 2}</span>`);
    await writeFile(path, html);
  }
}
