import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist');
await cp('public', 'dist', { recursive: true });
console.log('Static website built in dist/');
const { buildArtists } = await import('./artists.mjs');
await buildArtists();

// Tie asset URLs to their contents so browsers load matching scripts and styles.
const { createHash } = await import('node:crypto');
const { readdir, readFile, writeFile } = await import('node:fs/promises');
const { resolve, dirname } = await import('node:path');
const moduleHashes = new Map();
async function versionModule(path) {
  if (moduleHashes.has(path)) return moduleHashes.get(path);
  let code = await readFile(path, 'utf8');
  const imports = [...code.matchAll(/\bfrom\s+['"]((?:\.\.\/|\.\/)[^'"?]+\.js)['"]/g)];
  for (const match of imports) {
    const hash = await versionModule(resolve(dirname(path), match[1]));
    code = code.replaceAll("'" + match[1] + "'", "'" + match[1] + '?v=' + hash + "'")
      .replaceAll('"' + match[1] + '"', '"' + match[1] + '?v=' + hash + '"');
  }
  await writeFile(path, code);
  const hash = createHash('sha256').update(code).digest('hex').slice(0, 12);
  moduleHashes.set(path, hash);
  return hash;
}
async function versionAssets(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = directory + '/' + entry.name;
    if (entry.isDirectory()) {
      await versionAssets(path);
    } else if (entry.name.endsWith('.html')) {
      const html = await readFile(path, 'utf8');
      const matches = [...html.matchAll(/(?:src|href)="((?:\.\.\/|\.\/)[^"?]+\.(?:js|css))"/g)];
      let updated = html;
      for (const match of matches) {
        const assetPath = resolve(directory, match[1]);
        const hash = assetPath.endsWith('.js') ? await versionModule(assetPath)
          : createHash('sha256').update(await readFile(assetPath)).digest('hex').slice(0, 12);
        updated = updated.replaceAll('"' + match[1] + '"', '"' + match[1] + '?v=' + hash + '"');
      }
      await writeFile(path, updated);
    }
  }
}
await versionAssets('dist');
