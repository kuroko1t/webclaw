import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';

/**
 * Rollup plugin that inlines chunk imports into content script bundles.
 *
 * Chrome extension content scripts are loaded as classic scripts (not ES
 * modules), so they cannot use `import` statements.  This plugin resolves
 * chunk imports at build time and concatenates the exported code directly
 * into the entry file.
 */
function inlineContentScriptChunks(): Plugin {
  const CONTENT_ENTRIES = ['content/content-script.js', 'content/page-bridge.js'];

  return {
    name: 'inline-content-script-chunks',
    generateBundle(_options, bundle) {
      const usedChunks = new Set<string>();

      for (const entry of CONTENT_ENTRIES) {
        const chunk = bundle[entry];
        if (!chunk || chunk.type !== 'chunk') continue;

        let code = chunk.code;

        // Resolve each static import and inline the exported bindings
        for (const depFileName of chunk.imports) {
          const dep = bundle[depFileName];
          if (!dep || dep.type !== 'chunk') continue;

          // Extract the exported bindings from the chunk
          const depCode = dep.code;

          // Remove the import statement from the entry and prepend the chunk code
          // Match: import { X as Y, ... } from './chunks/name.js';
          const importRegex = new RegExp(
            `import\\s*\\{[^}]*\\}\\s*from\\s*['"][^'"]*${depFileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"];?\\n?`,
          );
          code = code.replace(importRegex, '');

          // Remove export statements from the chunk code so it becomes plain declarations
          let inlinedCode = depCode
            .replace(/^export\s*\{[^}]*\};\s*$/gm, '')
            .replace(/^export\s+/gm, '');

          code = inlinedCode + '\n' + code;
          usedChunks.add(depFileName);
        }

        chunk.code = code;
        chunk.imports = [];
      }

      // Remove chunks only used by content scripts
      for (const chunkName of usedChunks) {
        // Check if any non-content-script entry still imports this chunk
        const stillNeeded = Object.values(bundle).some(
          (b) =>
            b.type === 'chunk' &&
            !CONTENT_ENTRIES.includes(b.fileName) &&
            b.imports.includes(chunkName),
        );
        // Keep the chunk – the service worker may need it
        if (!stillNeeded) {
          // Don't delete: the service worker also uses it via ES import
        }
      }
    },
  };
}

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        'background/service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
        'content/content-script': resolve(__dirname, 'src/content/content-script.ts'),
        'content/page-bridge': resolve(__dirname, 'src/content/page-bridge.ts'),
        'sidepanel/sidepanel': resolve(__dirname, 'src/sidepanel/sidepanel.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: '[name].[ext]',
      },
      plugins: [inlineContentScriptChunks()],
    },
    target: 'esnext',
    minify: false,
  },
  resolve: {
    alias: {
      '@webclaw/shared': resolve(__dirname, '../shared/src/index.ts'),
    },
  },
});
