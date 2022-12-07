import { join, resolve } from 'node:path';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';
import { NodeModulesPolyfillPlugin } from '@esbuild-plugins/node-modules-polyfill';
import nodePolyfills from 'rollup-plugin-polyfill-node';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

function fixBigIntIssue() {
  return {
    name: 'fixBigIntIssue',
    writeBundle: {
      sequential: true,
      order: 'post',
      async handler({ dir }) {
        const files = await readdir(join(resolve(dir), 'assets'));
        let file = files.find((f) => f.startsWith('App') && f.endsWith('.js'));
        if (file) {
          let fullFile = join(resolve(dir), 'assets', file);
          let f = await readFile(fullFile, { encoding: 'utf8' });
          await writeFile(fullFile, f.replaceAll(/[al]\.BigInt\(/g, 'A.BigInt('));
          console.log("Updated App file");
        } else {
          console.error("App file not found");
        }
      }
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Node.js global to browser globalThis
  define: {
    global: 'globalThis'
  },
  server: {
    port: 5183,
    strictPort: true
  },
  build: {
    target: ['es2020'],
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        embedded: resolve(__dirname, 'embedded.html')
      },
      plugins: [nodePolyfills(), nodeResolve(), commonjs(), fixBigIntIssue()]
    }
  },
  base: '',
  publicDir: 'web_public',
  experimental: {
    renderBuiltUrl: (filename, { hostType }) => {
      return { relative: true };
    }
  },
  resolve: {
    alias: {
      events: 'rollup-plugin-node-polyfills/polyfills/events',
      '/fonts': resolve(__dirname, 'node_modules/compound-styles/public/fonts')
    }
  },
  optimizeDeps: {
    esbuildOptions: {
      // Node.js global to browser globalThis
      define: {
        global: 'globalThis'
      },
      // Enable esbuild polyfill plugins
      plugins: [
        NodeGlobalsPolyfillPlugin({
          buffer: true
        }),
        NodeModulesPolyfillPlugin()
      ]
    }
  }
});
