import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/freecash/schema.ts',
  out: './drizzle',
});
