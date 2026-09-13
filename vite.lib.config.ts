import { defineConfig } from 'vite';

// Library build for npm: ThinkingCube.tsx -> lib/ as ESM + CommonJS.
// The demo site keeps using vite.config.ts (output: dist/).
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  build: {
    outDir: 'lib',
    emptyOutDir: true,
    copyPublicDir: false,
    sourcemap: true,
    lib: {
      entry: 'ThinkingCube.tsx',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'thinking-cube.js' : 'thinking-cube.cjs'),
    },
    rollupOptions: {
      // React comes from the app that installs the package, never bundled.
      external: ['react', 'react/jsx-runtime', 'react-dom'],
      // Keeps the component usable in Next.js App Router without a wrapper.
      // exports: 'named' keeps require('thinking-cube').ThinkingCube working in CommonJS.
      output: { banner: '"use client";', exports: 'named' },
    },
  },
});
