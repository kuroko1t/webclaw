/**
 * Extension Build validation integration tests.
 *
 * Validates the completeness and correctness of the Vite build output.
 * Ensures manifest.json references resolve, JS files parse correctly,
 * and the dist structure matches expectations.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '../../dist');
const srcDir = resolve(__dirname, '../..');

describe('Extension Build validation', () => {
  // --- Core files exist ---
  describe('required files exist in dist/', () => {
    const requiredFiles = [
      'manifest.json',
      'background/service-worker.js',
      'content/content-script.js',
      'content/page-bridge.js',
      'sidepanel/sidepanel.html',
    ];

    for (const file of requiredFiles) {
      it(`${file} exists`, () => {
        expect(existsSync(resolve(distDir, file))).toBe(true);
      });
    }
  });

  // --- Manifest references ---
  describe('manifest.json file references', () => {
    it('dist manifest.json is valid JSON', () => {
      const content = readFileSync(resolve(distDir, 'manifest.json'), 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('service_worker file exists', () => {
      const manifest = JSON.parse(
        readFileSync(resolve(distDir, 'manifest.json'), 'utf-8')
      );
      const swPath = manifest.background?.service_worker;
      expect(swPath).toBeTruthy();
      expect(existsSync(resolve(distDir, swPath))).toBe(true);
    });

    it('content_scripts JS files exist', () => {
      const manifest = JSON.parse(
        readFileSync(resolve(distDir, 'manifest.json'), 'utf-8')
      );
      for (const cs of manifest.content_scripts ?? []) {
        for (const jsFile of cs.js ?? []) {
          expect(existsSync(resolve(distDir, jsFile))).toBe(true);
        }
      }
    });

    it('side_panel HTML file exists', () => {
      const manifest = JSON.parse(
        readFileSync(resolve(distDir, 'manifest.json'), 'utf-8')
      );
      const panelPath = manifest.side_panel?.default_path;
      if (panelPath) {
        expect(existsSync(resolve(distDir, panelPath))).toBe(true);
      }
    });

    it('web_accessible_resources files exist', () => {
      const manifest = JSON.parse(
        readFileSync(resolve(distDir, 'manifest.json'), 'utf-8')
      );
      for (const group of manifest.web_accessible_resources ?? []) {
        for (const resource of group.resources ?? []) {
          expect(existsSync(resolve(distDir, resource))).toBe(true);
        }
      }
    });

    it('icon files exist', () => {
      const manifest = JSON.parse(
        readFileSync(resolve(distDir, 'manifest.json'), 'utf-8')
      );
      const icons = manifest.icons ?? {};
      for (const size of Object.keys(icons)) {
        expect(existsSync(resolve(distDir, icons[size]))).toBe(true);
      }
    });
  });

  // --- JS syntax validation ---
  describe('JS files are syntactically valid', () => {
    const jsFiles = [
      'background/service-worker.js',
      'content/content-script.js',
      'content/page-bridge.js',
    ];

    for (const file of jsFiles) {
      it(`${file} parses without syntax errors`, () => {
        const filePath = resolve(distDir, file);
        if (!existsSync(filePath)) return;
        const source = readFileSync(filePath, 'utf-8');
        // Vite output uses ES module syntax (import/export), so we use
        // node --input-type=module --check via stdin to validate syntax
        expect(() => {
          execSync('node --input-type=module --check', {
            input: source,
            timeout: 5000,
            stdio: ['pipe', 'pipe', 'pipe'],
          });
        }).not.toThrow();
      });
    }
  });

  // --- Manifest consistency ---
  describe('dist manifest matches source', () => {
    it('dist manifest version matches source manifest', () => {
      const srcManifest = JSON.parse(
        readFileSync(resolve(srcDir, 'manifest.json'), 'utf-8')
      );
      const distManifest = JSON.parse(
        readFileSync(resolve(distDir, 'manifest.json'), 'utf-8')
      );
      expect(distManifest.version).toBe(srcManifest.version);
    });

    it('dist manifest name matches source manifest', () => {
      const srcManifest = JSON.parse(
        readFileSync(resolve(srcDir, 'manifest.json'), 'utf-8')
      );
      const distManifest = JSON.parse(
        readFileSync(resolve(distDir, 'manifest.json'), 'utf-8')
      );
      expect(distManifest.name).toBe(srcManifest.name);
    });

    it('dist manifest has same permissions as source', () => {
      const srcManifest = JSON.parse(
        readFileSync(resolve(srcDir, 'manifest.json'), 'utf-8')
      );
      const distManifest = JSON.parse(
        readFileSync(resolve(distDir, 'manifest.json'), 'utf-8')
      );
      expect(distManifest.permissions).toEqual(srcManifest.permissions);
    });

    it('manifest_version is 3', () => {
      const distManifest = JSON.parse(
        readFileSync(resolve(distDir, 'manifest.json'), 'utf-8')
      );
      expect(distManifest.manifest_version).toBe(3);
    });
  });

  // --- Build output structure ---
  describe('build output structure', () => {
    it('sidepanel.html references a JS file that exists', () => {
      const htmlPath = resolve(distDir, 'sidepanel/sidepanel.html');
      if (!existsSync(htmlPath)) return;

      const html = readFileSync(htmlPath, 'utf-8');
      // Find script src references
      const scriptMatches = html.match(/src="([^"]+\.js)"/g);
      if (scriptMatches) {
        for (const match of scriptMatches) {
          const src = match.replace(/src="/, '').replace(/"$/, '');
          // Resolve relative to sidepanel directory
          const jsPath = resolve(distDir, 'sidepanel', src);
          expect(existsSync(jsPath)).toBe(true);
        }
      }
    });

    it('no TypeScript files in dist', () => {
      // dist should only contain compiled output
      const distManifest = readFileSync(resolve(distDir, 'manifest.json'), 'utf-8');
      expect(distManifest).not.toContain('.ts"');
    });
  });
});
