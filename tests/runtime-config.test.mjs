import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Node API functions load ESM dependencies as ES modules', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(packageJson.type, 'module');
});

test('Node push function uses the Web fetch-style POST export', async () => {
  const pushModule = await import('../api/push-broadcast.js');
  assert.equal(typeof pushModule.POST, 'function');
  assert.equal('default' in pushModule, false);
});
