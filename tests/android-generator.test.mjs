import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Android generator wires TWA notification delegation when enabled', async () => {
  const source = await readFile(new URL('../tools/generate-android-project.cjs', import.meta.url), 'utf8');
  const manifest = JSON.parse(
    await readFile(new URL('../twa-manifest.json', import.meta.url), 'utf8')
  );

  assert.match(source, /androidbrowserhelper:2\.7\.2/);
  assert.ok(manifest.minSdkVersion >= 23, 'Android Browser Helper 2.7.2 requires minSdk 23');
  assert.match(source, /android\.permission\.POST_NOTIFICATIONS/);
  assert.match(source, /NotificationPermissionRequestActivity/);
  assert.match(source, /class DelegationService extends/);
  assert.match(source, /android:name="\.DelegationService"/);
  assert.match(source, /android\.support\.customtabs\.trusted\.SMALL_ICON/);
  assert.match(source, /@drawable\/ic_notification/);
  assert.match(source, /class PrimaLauncherActivity extends/);
  assert.match(source, /NotificationUtils\.createNotificationChannel/);
  assert.doesNotMatch(source, /ActivityCompat\.requestPermissions/);
  assert.doesNotMatch(source, /onRequestPermissionsResult/);
  assert.doesNotMatch(source, /launchTwa\(\)/);
  assert.match(
    source,
    /protected boolean shouldLaunchImmediately\(\)[\s\S]*NotificationUtils\.createNotificationChannel\([\s\S]*return true;/
  );
  assert.match(source, /const LAUNCHER_ACTIVITY = ENABLE_NOTIFICATIONS/);
  assert.match(source, /\? '\.PrimaLauncherActivity'/);
  assert.match(source, /manifest\.enableNotifications/);
  assert.match(source, /os\.tmpdir\(\)/);
});

test('Android generator keeps committed Java sources instead of overwriting them', async () => {
  const source = await readFile(new URL('../tools/generate-android-project.cjs', import.meta.url), 'utf8');

  assert.match(source, /function writeIfAbsent\(/);
  assert.match(source, /writeIfAbsent\(`app\/src\/main\/java\/\$\{PKG_ID[\s\S]*?DelegationService\.java`/);
  assert.match(source, /writeIfAbsent\(`app\/src\/main\/java\/\$\{PKG_ID[\s\S]*?PrimaLauncherActivity\.java`/);
});

test('Android generator ships a native splash so cold start is not a blank screen', async () => {
  const source = await readFile(new URL('../tools/generate-android-project.cjs', import.meta.url), 'utf8');

  assert.match(source, /SPLASH_IMAGE_DRAWABLE/);
  assert.match(source, /@drawable\/splash/);
  assert.match(source, /SPLASH_SCREEN_BACKGROUND_COLOR/);
  assert.match(source, /FILE_PROVIDER_AUTHORITY/);
  assert.match(source, /androidx\.core\.content\.FileProvider/);
  assert.match(source, /res\/xml\/filepaths\.xml/);
  assert.match(source, /twa_splash/);
  assert.match(source, /drawable-xxxhdpi\/splash\.png/);
});

test('Android generator resizes launcher icons per density when ImageMagick exists', async () => {
  const source = await readFile(new URL('../tools/generate-android-project.cjs', import.meta.url), 'utf8');

  // ImageMagick 7 renamed `convert` to `magick`; probing both keeps CI honest.
  assert.match(source, /\['magick', 'convert'\]/);
  assert.match(source, /-resize \$\{size\}x\$\{size\}/);
});
