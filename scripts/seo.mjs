import { readFile, writeFile, readdir } from 'node:fs/promises';
const base = 'https://smth2ng.github.io/3m_music-/';
const descriptions = {
  'index.html': '3М music — продюсерский центр в Туле. Вокал, запись, создание треков, клипов и продвижение музыкальных проектов.',
  'artists.html': 'Артисты продюсерского центра 3М music. Фотографии, музыкальные проекты и ссылки для прослушивания.',
  'teachers.html': 'Преподаватели 3М music в Туле. Знакомство с командой музыкального продюсерского центра.',
  'contacts.html': 'Свяжитесь с 3М music — Тула, Городской переулок, 9. Телефон Михаила 8-910-940-76-08.',
  'artist.html': 'Страница музыкального проекта 3М music.'
};
const escape = value => value.replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
export async function buildSEO() {
  const files = ['index.html','artists.html','teachers.html','contacts.html','artist.html','admin/index.html',
    ...(await readdir('dist/artists')).filter(file=>file.endsWith('.html')).map(file=>'artists/'+file)];
  const sitemap = [];
  const artists = JSON.parse(await readFile('public/data/artists.json', 'utf8')).artists;
  for (const file of files) {
    let html = await readFile('dist/' + file, 'utf8');
    const title = html.match(/<title>(.*?)<\/title>/s)?.[1] ?? '3М music';
    const hidden = ['admin/index.html','artist.html','artists/artist-1.html','artists/artist-2.html'].includes(file);
    const profile = artists.find(artist => file === 'artists/' + artist.id + '.html');
    const image = base + (profile?.photo || 'assets/artists-front.webp');
    const url = base + (file === 'index.html' ? '' : file);
    const existingDescription = html.match(/<meta name="description" content="([^"]*)">/)?.[1];
    const description = descriptions[file] ? escape(descriptions[file]) : existingDescription || 'Музыкальный проект 3М music.';
    html = html.replace(/\s*<meta name="(?:description|robots)"[^>]*>/g,'');
    html = html.replace(/\s*<link rel="canonical"[^>]*>/g,'').replace(/\s*<meta property="og:[^"]+"[^>]*>/g,'');
    const head = `<meta name="description" content="${description}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image}">
${hidden ? '<meta name="robots" content="noindex,follow">' : ''}`;
    html = html.replace('</head>', head + '\n</head>');
    if (file === 'index.html') {
      const business = { '@context':'https://schema.org', '@type':'LocalBusiness', name:'3М music', url:base, telephone:'+79109407608',
        address:{'@type':'PostalAddress',streetAddress:'Городской переулок, 9',addressLocality:'Тула',addressCountry:'RU'} };
      html = html.replace('</head>', '<script type="application/ld+json">' + JSON.stringify(business) + '</script>\n</head>');
    }
    await writeFile('dist/' + file, html);
    if (!hidden) sitemap.push(url);
  }
  await writeFile('dist/sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + sitemap.map(url=>'<url><loc>'+escape(url)+'</loc></url>').join('')+'</urlset>\n');
}
