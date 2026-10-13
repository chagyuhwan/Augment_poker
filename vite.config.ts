import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  base: './',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // R3F/drei가 별도 React·three를 끌어오면 Invalid hook call이 난다. 하나로 묶는다.
  resolve: {
    dedupe: ['react', 'react-dom', 'three'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'three', '@react-three/fiber', '@react-three/drei', 'maath'],
  },
  server: { port: 5173, strictPort: true },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
