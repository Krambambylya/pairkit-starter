import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'api/index': 'src/api/index.ts',
    'client/index': 'src/client/index.ts',
  },
  format: ['esm'],
  platform: 'neutral',
  target: 'es2022',
  sourcemap: true,
  clean: true,
  splitting: false,
  external: ['zod', '@orpc/client', '@orpc/contract'],
});
