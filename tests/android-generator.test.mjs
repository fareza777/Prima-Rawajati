import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Android generator wires TWA notification delegation when enabled', async () => {
  const source = await readFile(new URL('../tools/generate-android-project.cjs', import.meta.url), 'utf8');
  const manifest = JSON.parse(
    await readFile(new URL('../twa-manifest.json', import.meta.url), 'utf8')
  );

  assert.match(source, /android\.permission\.POST_NOTIFICATIONS/);
  assert.match(source, /NotificationPermissionRequestActivity/);
  assert.match(source, /class DelegationService extends/);
  assert.match(source, /android:name="\.DelegationService"/);
  assert.match(source, /android\.support\.customtabs\.trusted\.SMALL_ICON/);
  assert.match(source, /@drawable\/ic_notification/);
  assert.match(source, /manifest\.enableNotifications/);
  assert.match(source, /os\.tmpdir\(\)/);
  assert.ok(manifest.enableNotifications === true, 'notification delegation must stay on');
});

test('Android build pins the configuration proven in production code 19', async () => {
  const source = await readFile(new URL('../tools/generate-android-project.cjs', import.meta.url), 'utf8');
  const manifest = JSON.parse(
    await readFile(new URL('../twa-manifest.json', import.meta.url), 'utf8')
  );

  // code 19 (ABH 2.5.0) runs in production; every build shipping 2.7.2
  // (code 20-24) was reported by Play as "app doesn't open or load".
  assert.equal(manifest.androidBrowserHelperVersion, '2.5.0');
  assert.equal(manifest.minSdkVersion, 21);
  assert.doesNotMatch(source, /androidbrowserhelper:2\.7\.2/);
  assert.match(source, /androidbrowserhelper:\$\{ABH_VERSION\}/);

  // Play requires API 36 for updates from 2026-08-31; code 20 already shipped
  // targetSdk 36 alongside ABH 2.5.0, so it is not implicated in the crash.
  assert.equal(manifest.targetSdkVersion, 36);

  // The library launcher only — no custom subclass in the startup path.
  assert.match(source, /const LAUNCHER_ACTIVITY = 'com\.google\.androidbrowserhelper\.trusted\.LauncherActivity'/);
  assert.doesNotMatch(source, /class PrimaLauncherActivity/);
  assert.doesNotMatch(source, /shouldLaunchImmediately/);

  // Native splash stays opt-in and off until a build is verified on a device.
  assert.equal(manifest.enableNativeSplash, false);
  assert.match(source, /const ENABLE_NATIVE_SPLASH = manifest\.enableNativeSplash === true/);
});

test('Android generator keeps committed Java sources instead of overwriting them', async () => {
  const source = await readFile(new URL('../tools/generate-android-project.cjs', import.meta.url), 'utf8');

  assert.match(source, /function writeIfAbsent\(/);
  assert.match(source, /writeIfAbsent\(`app\/src\/main\/java\/\$\{PKG_ID[\s\S]*?DelegationService\.java`/);
});

test('Android generator resizes launcher icons per density when ImageMagick exists', async () => {
  const source = await readFile(new URL('../tools/generate-android-project.cjs', import.meta.url), 'utf8');

  // ImageMagick 7 renamed `convert` to `magick`; probing both keeps CI honest.
  assert.match(source, /\['magick', 'convert'\]/);
  assert.match(source, /-resize \$\{size\}x\$\{size\}/);
});
