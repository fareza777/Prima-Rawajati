import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Android generator wires TWA notification delegation when enabled', async () => {
  const source = await readFile(new URL('../tools/generate-android-project.cjs', import.meta.url), 'utf8');

  assert.match(source, /android\.permission\.POST_NOTIFICATIONS/);
  assert.match(source, /NotificationPermissionRequestActivity/);
  assert.match(source, /class DelegationService extends/);
  assert.match(source, /android:name="\.DelegationService"/);
  assert.match(source, /manifest\.enableNotifications/);
  assert.match(source, /os\.tmpdir\(\)/);
});
