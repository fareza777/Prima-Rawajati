#!/usr/bin/env node
/**
 * generate-android-project.js
 *
 * Generates a complete Android TWA project from twa-manifest.json.
 * ZERO external dependencies — pure Node.js stdlib only.
 *
 * Usage: node tools/generate-android-project.js
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');
const http  = require('http');

// ── Config ────────────────────────────────────────────────────────
const manifest = JSON.parse(fs.readFileSync('twa-manifest.json', 'utf8'));

const PKG_ID   = manifest.packageId   || 'id.rawajati.prima';
const APP_NAME = manifest.name        || 'PRIMA';
const LAUNCHER = manifest.launcherName|| 'PRIMA';
const HOST     = manifest.host        || 'prima-rawajati.vercel.app';
const START    = manifest.startUrl    || '/';
const COLOR    = manifest.themeColor  || '#0A1F44';
const BG_COLOR = manifest.backgroundColor || '#0A1F44';
const ICON_URL = manifest.iconUrl     || `https://${HOST}/img/icons/icon-512.png`;
const MASK_URL = manifest.maskableIconUrl || ICON_URL;
const V_CODE   = String(manifest.appVersion     || '1');
const V_NAME   = String(manifest.appVersionName || '1.0.0');
const MIN_SDK  = manifest.minSdkVersion || 21;

// Colour without '#'
function hex(c) { return c.replace('#',''); }

console.log('📦 Generating Android TWA project...');
console.log('   Package ID :', PKG_ID);
console.log('   App name   :', APP_NAME);
console.log('   Host       :', HOST);
console.log('   Version    :', `${V_NAME} (${V_CODE})`);

// ── Helpers ───────────────────────────────────────────────────────
function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('  +', filePath);
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const proto = url.startsWith('https') ? https : http;
    const file  = fs.createWriteStream(dest);
    proto.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        download(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', err => { fs.unlinkSync(dest); reject(err); });
  });
}

// ── 1. settings.gradle ───────────────────────────────────────────
write('settings.gradle', `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "prima"
include ':app'
`);

// ── 2. Root build.gradle ──────────────────────────────────────────
write('build.gradle', `plugins {
    id 'com.android.application' version '8.2.2' apply false
}
`);

// ── 3. gradle.properties ─────────────────────────────────────────
write('gradle.properties', `android.useAndroidX=true
android.enableJetifier=true
org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
org.gradle.parallel=true
`);

// ── 4. gradle-wrapper.properties ─────────────────────────────────
write('gradle/wrapper/gradle-wrapper.properties', `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-8.4-bin.zip
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`);

// ── 5. gradlew (standard script) ─────────────────────────────────
const gradlew = `#!/bin/sh
#
# Gradle start up script for UN*X
#
APP_HOME="$( cd "$( dirname "$0" )" && pwd )"
CLASSPATH="$APP_HOME/gradle/wrapper/gradle-wrapper.jar"
# Determine the Java command to use to start the JVM.
if [ -n "$JAVA_HOME" ] ; then
    if [ -x "$JAVA_HOME/jre/sh/java" ] ; then
        JAVACMD="$JAVA_HOME/jre/sh/java"
    else
        JAVACMD="$JAVA_HOME/bin/java"
    fi
else
    JAVACMD="java"
fi
exec "$JAVACMD" -classpath "$CLASSPATH" org.gradle.wrapper.GradleWrapperMain "$@"
`;
write('gradlew', gradlew);
try { fs.chmodSync('gradlew', 0o755); } catch(e) { /* ignore on Windows */ }

// ── 6. app/build.gradle ──────────────────────────────────────────
write('app/build.gradle', `plugins {
    id 'com.android.application'
}

android {
    namespace '${PKG_ID}'
    compileSdk 35

    defaultConfig {
        applicationId '${PKG_ID}'
        minSdk ${MIN_SDK}
        targetSdk 35
        versionCode ${V_CODE}
        versionName '${V_NAME}'
    }

    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_1_8
        targetCompatibility JavaVersion.VERSION_1_8
    }
}

dependencies {
    implementation 'com.google.androidbrowserhelper:androidbrowserhelper:2.6.2'
}
`);

// ── 7. app/proguard-rules.pro ────────────────────────────────────
write('app/proguard-rules.pro', '# Add project specific ProGuard rules here.\n');

// ── 8. AndroidManifest.xml (bubblewrap-compatible TWA) ─────────────
const SITE_ORIGIN = `https://${HOST}`;
const LAUNCH_URL  = `${SITE_ORIGIN}${START}`;
const WEB_MANIFEST = manifest.webManifestUrl || `${SITE_ORIGIN}/manifest.json`;

write('app/src/main/AndroidManifest.xml', `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:supportsRtl="true"
        android:theme="@style/AppTheme">

        <meta-data
            android:name="asset_statements"
            android:resource="@string/asset_statements" />

        <meta-data
            android:name="web_manifest_url"
            android:value="${WEB_MANIFEST}" />

        <activity
            android:name="com.google.androidbrowserhelper.trusted.LauncherActivity"
            android:exported="true"
            android:label="@string/app_name"
            android:theme="@style/AppTheme">

            <meta-data
                android:name="android.support.customtabs.trusted.DEFAULT_URL"
                android:value="${LAUNCH_URL}" />
            <meta-data
                android:name="androidx.browser.trusted.DEFAULT_URL"
                android:value="${LAUNCH_URL}" />

            <meta-data
                android:name="android.support.customtabs.trusted.STATUS_BAR_COLOR"
                android:resource="@color/colorPrimary" />
            <meta-data
                android:name="android.support.customtabs.trusted.NAVIGATION_BAR_COLOR"
                android:resource="@color/colorPrimary" />
            <meta-data
                android:name="android.support.customtabs.trusted.STATUS_BAR_COLOR_DARK"
                android:resource="@color/colorPrimary" />
            <meta-data
                android:name="android.support.customtabs.trusted.NAVIGATION_BAR_COLOR_DARK"
                android:resource="@color/colorPrimary" />
            <meta-data
                android:name="android.support.customtabs.trusted.SPLASH_SCREEN_BACKGROUND_COLOR"
                android:resource="@color/colorPrimary" />
            <meta-data
                android:name="android.support.customtabs.trusted.SPLASH_SCREEN_FADE_OUT_DURATION"
                android:value="300" />
            <meta-data
                android:name="android.support.customtabs.trusted.SCREEN_ORIENTATION"
                android:value="portrait" />

            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data
                    android:scheme="https"
                    android:host="${HOST}" />
            </intent-filter>
        </activity>

        <service
            android:name="com.google.androidbrowserhelper.trusted.DelegationService"
            android:exported="true"
            android:enabled="true">
            <intent-filter>
                <action android:name="android.support.customtabs.trusted.TRUSTED_WEB_ACTIVITY_SERVICE" />
                <category android:name="android.intent.category.DEFAULT" />
            </intent-filter>
        </service>

    </application>
</manifest>
`);

// ── 9. res/values ────────────────────────────────────────────────
write('app/src/main/res/values/strings.xml', `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">${APP_NAME}</string>
    <string name="launcher_name">${LAUNCHER}</string>
    <string name="asset_statements" translatable="false">
        [{
            \\"relation\\": [\\"delegate_permission/common.handle_all_urls\\"],
            \\"target\\": {
                \\"namespace\\": \\"web\\",
                \\"site\\": \\"${SITE_ORIGIN}\\"
            }
        }]
    </string>
</resources>
`);

write('app/src/main/res/values/colors.xml', `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="colorPrimary">#${hex(COLOR)}</color>
    <color name="colorPrimaryDark">#${hex(COLOR)}</color>
    <color name="colorBackground">#${hex(BG_COLOR)}</color>
</resources>
`);

// Theme.AppCompat requires appcompat library which is NOT a transitive dep of androidbrowserhelper.
// Use android:Theme.Material.Light.NoActionBar instead — built into the Android SDK (API 21+).
write('app/src/main/res/values/styles.xml', `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="android:Theme.Material.Light.NoActionBar">
        <item name="android:colorPrimary">@color/colorPrimary</item>
        <item name="android:colorPrimaryDark">@color/colorPrimaryDark</item>
        <item name="android:statusBarColor">@color/colorPrimary</item>
        <item name="android:navigationBarColor">@color/colorPrimary</item>
        <item name="android:windowBackground">@color/colorBackground</item>
    </style>
</resources>
`);

// ── 10. Launcher icons ────────────────────────────────────────────
async function setupIcons() {
  // Download 512px icon then resize with ImageMagick (available on ubuntu-latest)
  const iconSizes = [
    { dir: 'mipmap-mdpi',    size: 48  },
    { dir: 'mipmap-hdpi',    size: 72  },
    { dir: 'mipmap-xhdpi',   size: 96  },
    { dir: 'mipmap-xxhdpi',  size: 144 },
    { dir: 'mipmap-xxxhdpi', size: 192 },
  ];

  const src512 = 'img/icons/icon-512.png';
  const tmpIcon = '/tmp/prima-icon-512.png';

  // Use local icon if it exists, otherwise download
  if (fs.existsSync(src512)) {
    console.log('  📷 Using local icon-512.png');
    fs.copyFileSync(src512, tmpIcon);
  } else {
    console.log('  📥 Downloading icon from', ICON_URL);
    try {
      await download(ICON_URL, tmpIcon);
    } catch(e) {
      console.warn('  ⚠️  Icon download failed:', e.message, '— using placeholder');
      return;
    }
  }

  // Resize with ImageMagick's `convert` (installed on ubuntu-latest)
  const {execSync} = require('child_process');
  for (const {dir, size} of iconSizes) {
    const dest = `app/src/main/res/${dir}/ic_launcher.png`;
    fs.mkdirSync(`app/src/main/res/${dir}`, {recursive: true});
    try {
      execSync(`convert "${tmpIcon}" -resize ${size}x${size} "${dest}"`, {stdio: 'inherit'});
      console.log(`  + ${dest} (${size}px)`);
    } catch(e) {
      // Fallback: just copy the 512px version
      fs.copyFileSync(tmpIcon, dest);
      console.log(`  + ${dest} (${size}px — copy, convert not available)`);
    }
  }
}

// ── 11. gradle-wrapper.jar ────────────────────────────────────────
async function downloadWrapperJar() {
  const dest = 'gradle/wrapper/gradle-wrapper.jar';
  if (fs.existsSync(dest)) {
    console.log('  ✅ gradle-wrapper.jar already exists');
    return;
  }
  // Official Gradle wrapper jar from GitHub
  const url = 'https://github.com/gradle/gradle/raw/v8.4.0/gradle/wrapper/gradle-wrapper.jar';
  console.log('  📥 Downloading gradle-wrapper.jar...');
  try {
    await download(url, dest);
    console.log('  ✅ gradle-wrapper.jar downloaded');
  } catch(e) {
    console.warn('  ⚠️  gradle-wrapper.jar download failed:', e.message);
    console.warn('     Will try to use system gradle or gradlew without wrapper');
  }
}

// ── 12. Mirror assetlinks.json → public/ (Vercel static) ─────────
function syncPublicAssetLinks() {
  const src = '.well-known/assetlinks.json';
  if (!fs.existsSync(src)) return;
  fs.mkdirSync('public/.well-known', { recursive: true });
  fs.copyFileSync(src, 'public/.well-known/assetlinks.json');
  console.log('  + public/.well-known/assetlinks.json');
}

// ── Run ───────────────────────────────────────────────────────────
(async () => {
  try {
    syncPublicAssetLinks();
    await setupIcons();
    await downloadWrapperJar();

    // Verify critical files
    const required = [
      'settings.gradle',
      'app/build.gradle',
      'app/src/main/AndroidManifest.xml',
    ];
    for (const f of required) {
      if (!fs.existsSync(f)) throw new Error(`Missing: ${f}`);
    }

    console.log('');
    console.log('✅ Android project generated successfully!');
    console.log('   Run: ./gradlew bundleRelease assembleRelease');
  } catch(e) {
    console.error('\n❌ Generation failed:', e.message);
    process.exit(1);
  }
})();
