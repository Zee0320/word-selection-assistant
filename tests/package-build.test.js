const test = require('node:test');
const assert = require('node:assert/strict');

const pkg = require('../package.json');

test('defines separate Windows and Linux ARM64 build scripts', () => {
  assert.equal(pkg.scripts['build:win:x64'], 'electron-builder --win --x64');
  assert.equal(pkg.scripts['build:linux:arm64'], 'electron-builder --linux deb --arm64 -c.npmRebuild=false');
  assert.equal(
    pkg.scripts['rebuild:win:x64'],
    'node node_modules/@electron/rebuild/lib/cli.js -f -o better-sqlite3,@mukea/uiohook-napi'
  );
  assert.equal(
    pkg.scripts['rebuild:linux:arm64'],
    'node node_modules/@electron/rebuild/lib/cli.js -f -o better-sqlite3'
  );
});

test('configures an arm64 deb package for Linux builds', () => {
  assert.equal(pkg.build.linux.target[0].target, 'deb');
  assert.deepEqual(pkg.build.linux.target[0].arch, ['arm64']);
  assert.equal(pkg.build.linux.maintainer, 'Zee0320 <Zee0320@users.noreply.github.com>');
  assert.ok(pkg.build.deb.depends.includes('libgbm1'));
  assert.ok(pkg.build.deb.depends.includes('libasound2'));
  assert.ok(pkg.build.deb.depends.includes('xinput'));
  assert.ok(pkg.build.deb.depends.includes('xdotool'));
  assert.ok(pkg.build.deb.depends.includes('xclip'));
  assert.ok(pkg.build.deb.recommends.includes('libappindicator3-1'));
});

test('packages the offline dictionary for Windows but omits it from Linux builds', () => {
  assert.deepEqual(pkg.build.win.extraResources, [
    {
      from: 'assets/ecdict.db',
      to: 'ecdict.db'
    }
  ]);
  assert.equal(pkg.build.extraResources, undefined);
  assert.equal(pkg.build.linux.extraResources, undefined);
});
