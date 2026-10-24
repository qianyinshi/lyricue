import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const folder = mkdtempSync(join(tmpdir(), 'lyrics-editor-consumer-'));
function run(command, args, cwd = root, capture = false) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (capture) process.stderr.write((result.stdout ?? '') + (result.stderr ?? ''));
    throw new Error(`${command} failed with status ${result.status}`);
  }
  return result.stdout;
}
const [packed] = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', folder], root, true));
assert.ok(packed.files.every(({ path }) => path.startsWith('dist/') || ['package.json', 'README.md', 'README.zh-CN.md'].includes(path) || /^LICEN[CS]E(?:\.[^/]+)?$/i.test(path)), 'only public package files');
assert.deepEqual(Object.keys(manifest.dependencies ?? {}), [], 'no runtime UI/router/backend dependencies');
assert.deepEqual(Object.keys(manifest.peerDependencies ?? {}), [], 'no peer dependencies');
const dependencies = { [manifest.name]: `file:${join(folder, packed.filename)}` };
writeFileSync(join(folder, 'package.json'), JSON.stringify({ name: 'lyrics-editor-consumer', private: true, type: 'module', dependencies }, null, 2));
run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], folder);
const installed = join(folder, 'node_modules', ...manifest.name.split('/'));
const tree = JSON.parse(run('npm', ['ls', '--all', '--json'], folder, true));
assert.deepEqual(Object.keys(tree.dependencies[manifest.name].dependencies ?? {}), [], 'no transitive runtime dependencies');
for (const { path } of packed.files.filter(({ path }) => /\.(js|css)$/.test(path))) {
  assert.doesNotMatch(readFileSync(join(installed, path), 'utf8'), /@douyinfe|react-router|react-dom|react\/jsx|qianyin\.app|--qys-|\/api\/v1/);
}
writeFileSync(join(folder, 'smoke.mjs'), `import assert from 'node:assert/strict';
import { defineLyricsEditor } from '${manifest.name}';
import { parseLyrics, serializeLyrics, lyricBoundaryPreview } from '${manifest.name}/core';
import '${manifest.name}/register';
assert.equal(typeof defineLyricsEditor, 'function');
const source = '[00:01.200]hello\\n[00:03.000]';
const document = parseLyrics(source);
assert.equal(serializeLyrics(document), source);
assert.deepEqual(lyricBoundaryPreview(document.lines, 0, 'end', true, 12000), {startMs:2000,endMs:3000});
`);
run(process.execPath, ['smoke.mjs'], folder);
writeFileSync(join(folder, 'types.ts'), `import { defineLyricsEditor, type LyricsEditorElement, type LyricDocument } from '${manifest.name}';
import { parseLyrics } from '${manifest.name}/core';
const lyrics: LyricDocument = parseLyrics('[00:01]hello');
defineLyricsEditor();
const editor: LyricsEditorElement = document.createElement('lyrics-editor');
editor.load({audioSrc:'/audio.wav', lyrics, mode:'tap', locale:'en', keyboardScope:'page'});
editor.locale = 'zh-CN'; editor.keyboardScope = 'focused'; editor.pause(true);
editor.addEventListener('lyrics-save', event => { const text: string = event.detail.lyrics; console.log(text); });
editor.addEventListener('lyrics-dirty-change', event => { const dirty: boolean = event.detail.dirty; console.log(dirty); });
editor.addEventListener('click', event => console.log(event.clientX));
const saved = (event: CustomEvent<import('${manifest.name}').LyricsEditorResult>) => console.log(event.detail.lyrics);
editor.addEventListener('lyrics-save', saved); editor.removeEventListener('lyrics-save', saved);
editor.pause(); const snapshot: LyricDocument = editor.getDocument(); console.log(snapshot);
`);
writeFileSync(join(folder, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022','DOM'], strict: true, skipLibCheck: false, noEmit: true, noUncheckedSideEffectImports: true }, include: ['types.ts'] }));
run(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', join(folder, 'tsconfig.json')], folder);
mkdirSync(join(folder, 'example'));
for (const file of ['index.html', 'main.ts', 'demo-audio.ts', 'mode-illustration.ts', 'integration-examples.ts', 'page.css']) copyFileSync(join(root, 'examples/standalone', file), join(folder, 'example', file));
console.log(JSON.stringify({ folder, tarball: join(folder, packed.filename), size: packed.size, unpackedSize: packed.unpackedSize, files: packed.files.length, checks: ['pack allowlist', 'zero runtime and peer dependencies', 'tarball install outside workspace', 'no DOM needed to import UI', 'core round trip', 'no application imports', 'NodeNext consumer types'] }, null, 2));
