import { readFile, mkdir, writeFile } from 'node:fs/promises';

// The app has no runtime dependencies. Produce one offline HTML file using the
// same source modules, styles, and images as the local development server.
const modules = ['domain', 'recognition', 'storage', 'images', 'seed', 'app'];
let script = '';
for (const module of modules) {
  script += '\n' + (await readFile(`src/${module}.js`, 'utf8'))
    .replace(/^import .+ from .+;\n/gm, '')
    .replace(/^export /gm, '');
}
const assets = ['tray-complete', 'tray-missing', 'tray-uncertain'];
for (const asset of assets) {
  const data = 'data:image/svg+xml;base64,' + (await readFile(`assets/${asset}.svg`)).toString('base64');
  script = script.replaceAll(`/assets/${asset}.svg`, data);
}
const favicon = 'data:image/svg+xml;base64,' + (await readFile('favicon.svg')).toString('base64');
script = script.replaceAll('/favicon.svg', favicon);
const css = await readFile('styles.css', 'utf8');
let html = await readFile('index.html', 'utf8');
html = html.replace('<link rel="stylesheet" href="/styles.css" />', `<style>${css}</style>`)
  .replace('<script type="module" src="/src/app.js"></script>', '')
  .replaceAll('/favicon.svg', favicon)
  .replace('</body>', `<script type="module">\n${script.replaceAll('</script', '<\\/script')}\n</script>\n</body>`);
await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', html);
console.log('Built dist/index.html — a self-contained offline preview.');
