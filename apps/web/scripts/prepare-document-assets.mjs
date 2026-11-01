import { createRequire } from 'node:module';
import { mkdir, copyFile, readdir, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'public', 'document-tools');
const packageRoot = (name) => path.dirname(require.resolve(`${name}/package.json`));
await mkdir(path.join(output, 'core'), { recursive: true });
await mkdir(path.join(output, 'lang'), { recursive: true });
await copyFile(path.join(packageRoot('pdfjs-dist'), 'build', 'pdf.worker.min.mjs'), path.join(output, 'pdf.worker.min.mjs'));
await cp(path.join(packageRoot('pdfjs-dist'), 'wasm'), path.join(output, 'pdf-wasm'), { recursive: true });
await cp(path.join(packageRoot('pdfjs-dist'), 'standard_fonts'), path.join(output, 'pdf-fonts'), { recursive: true });
await cp(path.join(packageRoot('pdfjs-dist'), 'cmaps'), path.join(output, 'pdf-cmaps'), { recursive: true });
await copyFile(path.join(packageRoot('tesseract.js'), 'dist', 'worker.min.js'), path.join(output, 'worker.min.js'));
for (const name of await readdir(packageRoot('tesseract.js-core'))) {
  if (name.includes('.wasm')) await copyFile(path.join(packageRoot('tesseract.js-core'), name), path.join(output, 'core', name));
}
const language = packageRoot('@tesseract.js-data/eng');
const candidates = ['4.0.0_best_int', '4.0.0', '4.0.0_fast'];
let copied = false;
for (const directory of candidates) {
  try { await copyFile(path.join(language, directory, 'eng.traineddata.gz'), path.join(output, 'lang', 'eng.traineddata.gz')); copied = true; break; } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
if (!copied) throw new Error('Bundled OCR language file not found.');
await mkdir(path.join(output, 'licenses'), { recursive: true });
for (const name of ['pdfjs-dist', 'tesseract.js', 'tesseract.js-core', '@tesseract.js-data/eng']) {
  for (const file of await readdir(packageRoot(name))) {
    if (/^(license|licence|notice)(\.|$)/i.test(file)) await copyFile(path.join(packageRoot(name), file), path.join(output, 'licenses', name.replace(/[@/]/g, '_') + '-' + file));
  }
}
console.log('Prepared same-origin PDF and OCR assets.');
