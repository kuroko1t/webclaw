/**
 * Post-build script: copies manifest.json, static assets, and fixes paths in dist/
 */
import { cpSync, mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const dist = resolve(root, 'dist');

// Copy manifest.json
cpSync(resolve(root, 'manifest.json'), resolve(dist, 'manifest.json'));

// Copy icons
mkdirSync(resolve(dist, 'icons'), { recursive: true });
cpSync(resolve(root, 'public/icons'), resolve(dist, 'icons'), { recursive: true });

// Fix: Vite outputs HTML at dist/src/sidepanel/sidepanel.html
// Move it to dist/sidepanel/sidepanel.html and fix relative paths
const srcSidepanel = resolve(dist, 'src/sidepanel/sidepanel.html');
const destSidepanel = resolve(dist, 'sidepanel/sidepanel.html');
if (existsSync(srcSidepanel)) {
  let html = readFileSync(srcSidepanel, 'utf-8');
  // Fix relative paths: ../../sidepanel/ -> ./ (since we're moving up one level)
  html = html.replace(/\.\.\/\.\.\/sidepanel\//g, './');
  // Fix chunk paths: ../../chunks/ -> ../chunks/
  html = html.replace(/\.\.\/\.\.\/chunks\//g, '../chunks/');
  writeFileSync(destSidepanel, html);
  rmSync(resolve(dist, 'src'), { recursive: true, force: true });
}

console.log('Post-build: copied manifest.json, icons, fixed paths in dist/');
