import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    env: {
      DATABASE_URL: 'postgresql://energya:energya_dev@127.0.0.1:5432/energya_nest?schema=public',
      JWT_SECRET: 'energya_connect_dotnet9_super_secret_jwt_key_2026_x89f_long_enough',
      NODE_ENV: 'test',
    },
  },
});
