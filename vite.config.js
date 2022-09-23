import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';
import nodePolyfills from "rollup-plugin-polyfill-node";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Node.js global to browser globalThis
  define: {
    global: "globalThis",
  },
  server: {
    port: 5183,
  },
  build: {
    target: ['es2020'],
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        embedded: resolve(__dirname, 'embedded.html'),
      },
      plugins: [nodePolyfills()],
    },
  },
  base: '',
  publicDir: 'web_public',
  experimental: {
    renderBuiltUrl: (filename, { hostType }) => {
      return { relative: true };
    },
  },
  resolve: {
    alias: {
      '/fonts': resolve(__dirname, 'node_modules/compound-styles/public/fonts'),
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      // Node.js global to browser globalThis
      define: {
        global: 'globalThis',
      },
      // Enable esbuild polyfill plugins
      plugins: [
        NodeGlobalsPolyfillPlugin({
          buffer: true,
        }),
      ],
    },
  },
});
