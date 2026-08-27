import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const distDirectory = resolve(root, 'dist');
const androidAssetsDirectory = resolve(root, 'MyTVLauncher-v17-BeuotQ/app/src/main/assets');
const sourceHtml = readFileSync(resolve(distDirectory, 'index.html'), 'utf8');

function requiredAsset(expression, description) {
  const match = sourceHtml.match(expression);
  if (!match?.[1]) {
    throw new Error(`Unable to locate ${description} in dist/index.html.`);
  }
  return match[1];
}

const stylesheet = requiredAsset(/href="\.\/(assets\/index-[^"]+\.css)"/, 'stylesheet');
const legacyPolyfills = requiredAsset(/id="vite-legacy-polyfill" src="\.\/(assets\/[^"]+)"/, 'legacy polyfills');
const legacyEntry = requiredAsset(/id="vite-legacy-entry" data-src="\.\/(assets\/[^"]+)"/, 'legacy entry bundle');
const requiredAssets = [stylesheet, legacyPolyfills, legacyEntry];

// Android 7 WebView may not understand <script type="module">. The embedded
// launcher therefore loads only the ES5/SystemJS fallback, while the regular
// Vite output remains available for development previews. Omitting the unused
// modern entry also reduces the startup payload on low-power S905X hardware.
rmSync(resolve(androidAssetsDirectory, 'assets'), { recursive: true, force: true });
mkdirSync(resolve(androidAssetsDirectory, 'assets'), { recursive: true });

for (const asset of requiredAssets) {
  const source = resolve(distDirectory, asset);
  const destination = resolve(androidAssetsDirectory, asset);
  if (!existsSync(source)) {
    throw new Error(`Missing production asset: ${asset}`);
  }
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination);
}

const androidHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#202124" />
    <title>Android TV Launcher</title>
    <link rel="stylesheet" href="./${stylesheet}" />
  </head>
  <body>
    <div id="root"></div>
    <script src="./${legacyPolyfills}"></script>
    <script>System.import('./${legacyEntry}');</script>
  </body>
</html>
`;

writeFileSync(resolve(androidAssetsDirectory, 'launcher.html'), androidHtml, 'utf8');
console.log('Android 7 legacy bundle synchronized.');
console.log(`  CSS: ${stylesheet}`);
console.log(`  Polyfills: ${legacyPolyfills}`);
console.log(`  Entry: ${legacyEntry}`);
