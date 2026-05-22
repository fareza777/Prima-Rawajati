#!/usr/bin/env node
/**
 * generate-android-project.js
 *
 * Non-interactive replacement for `bubblewrap init`.
 * Uses @bubblewrap/core programmatically — no TTY/prompts required.
 *
 * Usage: node tools/generate-android-project.js
 * Reads:  ./twa-manifest.json  (must exist, with signingKey credentials injected)
 * Output: ./app/  (Android Gradle project)
 */

const path = require('path');
const fs   = require('fs');

async function main() {
  const cwd = process.cwd();
  console.log('📂 Working directory:', cwd);

  // ── Resolve @bubblewrap/core ──────────────────────────────────────
  let TwaManifest, TwaGenerator;
  try {
    ({ TwaManifest, TwaGenerator } = require('@bubblewrap/core'));
    console.log('✅ @bubblewrap/core loaded');
  } catch (e) {
    console.error('❌ Cannot load @bubblewrap/core:', e.message);
    console.error('   Make sure @bubblewrap/cli is installed globally.');
    process.exit(1);
  }

  // ── Read twa-manifest.json ────────────────────────────────────────
  const manifestPath = path.join(cwd, 'twa-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('❌ twa-manifest.json not found at', manifestPath);
    process.exit(1);
  }

  console.log('📋 Reading twa-manifest.json...');
  const manifest = await TwaManifest.fromFile(manifestPath);
  console.log('   Package ID :', manifest.packageId);
  console.log('   Host       :', manifest.host);
  console.log('   App name   :', manifest.name);
  console.log('   Start URL  :', manifest.startUrl);

  // ── Generate Android project ──────────────────────────────────────
  console.log('🏗️  Generating Android project...');
  const generator = new TwaGenerator();

  // API v1.x: generateAndroidProject(targetDir, twaManifest)
  // API v0.x: generateAndroidProject(twaManifest, targetDir)
  // We try both signatures.
  let success = false;
  try {
    success = await generator.generateAndroidProject(cwd, manifest);
  } catch (e1) {
    console.warn('   First API signature failed:', e1.message);
    try {
      success = await generator.generateAndroidProject(manifest, cwd);
    } catch (e2) {
      console.error('❌ Both API signatures failed:');
      console.error('   ', e1.message);
      console.error('   ', e2.message);

      // Last-resort: inspect what methods are available
      console.error('   Available methods on TwaGenerator:',
        Object.getOwnPropertyNames(Object.getPrototypeOf(generator))
          .filter(m => m !== 'constructor')
      );
      process.exit(1);
    }
  }

  if (success === false) {
    console.error('❌ generateAndroidProject returned false');
    process.exit(1);
  }

  // ── Verify output ─────────────────────────────────────────────────
  const appDir = path.join(cwd, 'app');
  if (!fs.existsSync(appDir)) {
    console.error('❌ app/ directory was not created — generation may have failed silently');
    process.exit(1);
  }

  console.log('');
  console.log('✅ Android project generated successfully!');
  console.log('   Files in project root:');
  fs.readdirSync(cwd)
    .filter(f => !f.startsWith('.') && f !== 'node_modules')
    .forEach(f => console.log('   -', f));
}

main().catch(e => {
  console.error('❌ Unexpected error:', e);
  process.exit(1);
});
