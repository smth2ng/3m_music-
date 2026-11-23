import { readFile, writeFile } from 'node:fs/promises';
import { normalizeCollection } from '../public/content-store.js';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
export async function buildContent() {
  for (const name of ['teachers','releases']) {
    const source = JSON.parse(await readFile('public/data/' + name + '.json', 'utf8'))[name];
    const records = normalizeCollection(name, source);
    if (!Array.isArray(source) || source.length !== records.length) throw new Error('Invalid ' + name + ' data');
    if (name === 'teachers') {
      const cards = records.map(teacher => {
        const responsive = teacher.photo === 'assets/mikhail-grishin.webp'
          ? 'srcset="./assets/responsive/mikhail-grishin-160.webp 160w, ./assets/responsive/mikhail-grishin-320.webp 320w, ./assets/mikhail-grishin.webp 640w" sizes="(max-width: 767px) 42vw, 190px"' : '';
        const photo = teacher.photo
          ? '<img src="./' + escape(teacher.photo) + '" alt="' + escape(teacher.name) + '" width="640" height="640" loading="lazy" ' + responsive + '>' : '';
        return '<article class="teacher panel"><div class="teacher-copy"><h2>' + escape(teacher.name) + '</h2><p>' +
          escape(teacher.description || 'Информация о преподавателе готовится.') + '</p></div>' + photo + '</article>';
      }).join('');
      const html = await readFile('dist/teachers.html','utf8');
      await writeFile('dist/teachers.html', html.replace(/(<div class="teacher-list">)[\s\S]*?(<\/div>\s*<\/section>)/, '$1' + cards + '$2'));
    } else {
      const artists = JSON.parse(await readFile('public/data/artists.json','utf8')).artists;
      const cards = records.map(release => {
        const name = artists.find(artist=>artist.id===release.artistId)?.name || release.artistName;
        return `<article class="release-card panel"><img src="./${escape(release.photo)}" alt="Обложка — ${escape(release.title)}" width="640" height="640" loading="lazy"><p>${escape(name)}</p><h3>${escape(release.title)}</h3><a class="platform-link" href="${escape(release.url)}" target="_blank" rel="noopener noreferrer">Слушать</a></article>`;
      }).join('');
      let html = await readFile('dist/index.html','utf8');
      html = html.replace('<div id="release-list" class="release-grid"></div>', '<div id="release-list" class="release-grid">' + cards + '</div>');
      if (records.length) html = html.replace('id="releases-empty"', 'id="releases-empty" hidden');
      await writeFile('dist/index.html', html);
    }
  }
}
