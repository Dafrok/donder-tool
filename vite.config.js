import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// 获取 git commit hash（短版本）
let gitHash = 'unknown';
try {
  gitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
} catch (e) {
  console.warn('未能获取 git hash');
}

// 获取构建时间
const buildTime = new Date().toISOString();

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  base: process.env.GITHUB_ACTIONS ? '/donder-tool/' : '/',
  plugins: [react()],
  resolve: {
    alias: {}
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'esnext',
    minify: 'terser',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined;

          const normalized = id.replace(/\\/g, '/');

          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(normalized)) {
            return 'vendor-react';
          }

          if (
            /\/node_modules\/(?:@fluentui|@griffel|@emotion|@floating-ui|tabster|keyborg|stylis|rtl-css-js|@swc\/helpers)\//.test(
              normalized
            )
          ) {
            return 'vendor-fluent';
          }

          return 'vendor-misc';
        },
        assetFileNames: (assetInfo) => {
          if (assetInfo.name.endsWith('.py')) {
            return 'assets/py/[name]-[hash][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        }
      }
    }
  },
  server: {
    port: 5173,
    strictPort: false,
    headers: {
      // Pyodide 需要这些 headers
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },
  define: {
    'process.env.NODE_ENV': '"development"',
    global: 'globalThis',
    '__BUILD_TIME__': JSON.stringify(buildTime),
    '__GIT_HASH__': JSON.stringify(gitHash)
  }
});
