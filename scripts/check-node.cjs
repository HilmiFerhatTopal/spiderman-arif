// Decides whether the Node.js running this file can run SKYTHREAD's tooling:
// Vite 8 needs Node ^20.19.0 || >=22.12.0, and npm must come with it.
// Run directly by the BASLAT-* launchers (exit code 0 = usable, otherwise a
// one-line reason is printed) and required by scripts/launch.mjs.
// Written in old-style JavaScript on purpose so that even a very old Node.js
// reaches the version check and reports a readable reason.
'use strict';
var fs = require('fs');
var path = require('path');

function versionOk(version) {
  var parts = String(version).replace(/^v/, '').split('.');
  var major = Number(parts[0]);
  var minor = Number(parts[1]);
  if (major === 20) return minor >= 19;
  if (major === 22) return minor >= 12;
  return major > 22;
}

// npm's JavaScript entry point installed next to this Node.js (official
// installers, the portable download, nvm, Volta, Scoop), or null.
function npmCliPath() {
  var dir = path.dirname(process.execPath);
  var candidates = [
    path.join(dir, 'node_modules', 'npm', 'bin', 'npm-cli.js'), // Windows layout
    path.join(dir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'), // Unix layout
  ];
  for (var i = 0; i < candidates.length; i++) {
    if (fs.existsSync(candidates[i])) return candidates[i];
  }
  return null;
}

// An npm command on PATH (package-manager installs keep npm elsewhere), or null.
function npmOnPath() {
  var names = process.platform === 'win32' ? ['npm.cmd', 'npm.exe'] : ['npm'];
  var dirs = (process.env.PATH || '').split(path.delimiter);
  for (var i = 0; i < dirs.length; i++) {
    if (!dirs[i]) continue;
    for (var j = 0; j < names.length; j++) {
      var candidate = path.join(dirs[i], names[j]);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function check() {
  if (!versionOk(process.version)) {
    return { ok: false, reason: 'Node.js ' + process.version + ' çok eski (gereken: 22.12+ veya 20.19+)' };
  }
  if (!npmCliPath() && !npmOnPath()) {
    return { ok: false, reason: 'Node.js ' + process.version + ' bulundu ama npm yok' };
  }
  return { ok: true, reason: '' };
}

module.exports = { versionOk: versionOk, npmCliPath: npmCliPath, npmOnPath: npmOnPath, check: check };

if (require.main === module) {
  var result = check();
  if (!result.ok) console.log(result.reason);
  process.exit(result.ok ? 0 : 1);
}
