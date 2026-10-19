/**
 * src/model is shared by the backend and the browser dashboard, so it must stay pure: no Bun,
 * Node, database or HTTP imports. This keeps the dashboard's numbers identical to the bidder's.
 */
import { expect, test } from 'bun:test';
import { Glob } from 'bun';

const ALLOWED = [/^\.\/[\w-]+$/, /^\.\.\/shared\/(money|types)$/];

test('src/model imports only itself and pure shared types', async () => {
  for await (const file of new Glob('src/model/*.ts').scan('.')) {
    const source = await Bun.file(file).text();
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '');
    for (const spec of imports)
      expect(
        ALLOWED.some((re) => re.test(spec)),
        `${file} imports ${spec}`,
      ).toBe(true);
    expect(source, `${file} uses a Bun/Node global`).not.toMatch(/\b(Bun|process)\.|node:/);
  }
});

test('src/model bundles for the browser', async () => {
  const result = await Bun.build({ entrypoints: ['src/model/index.ts'], target: 'browser' });
  expect(result.success, result.logs.join('\n')).toBe(true);
});
