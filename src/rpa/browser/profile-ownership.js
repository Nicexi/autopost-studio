const fs = require('fs');
const os = require('os');
const path = require('path');

const markerName = '.autopost-profile-owner.json';

function canonicalPath(value) {
  return path.resolve(value);
}

function assertSafeProfileDirectory(directory, protectedDirectories = []) {
  const resolved = canonicalPath(directory);
  const stat = fs.lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('缓存目录必须是非符号链接目录');
  const actual = fs.realpathSync(resolved);
  const forbidden = [path.parse(resolved).root, os.homedir(), ...protectedDirectories].map((item) => {
    const candidate = canonicalPath(item);
    try { return fs.realpathSync(candidate); } catch { return candidate; }
  });
  if (forbidden.includes(actual)) throw new Error('缓存目录不能是磁盘根目录、用户主目录或应用数据根目录');
  return resolved;
}

function markProfileOwned(directory, accountId, protectedDirectories = []) {
  const resolved = assertSafeProfileDirectory(directory, protectedDirectories);
  const markerPath = path.join(resolved, markerName);
  const marker = JSON.stringify({ accountId: String(accountId), version: 1 });
  try {
    fs.writeFileSync(markerPath, marker, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let existing;
    try { existing = JSON.parse(fs.readFileSync(markerPath, 'utf8')); } catch {}
    if (existing?.accountId !== String(accountId)) throw new Error('缓存目录已归属其他账号，不能复用');
  }
  return resolved;
}

function isProfileOwnedBy(directory, accountId, protectedDirectories = []) {
  try {
    const resolved = assertSafeProfileDirectory(directory, protectedDirectories);
    const marker = JSON.parse(fs.readFileSync(path.join(resolved, markerName), 'utf8'));
    return marker.version === 1 && marker.accountId === String(accountId);
  } catch {
    return false;
  }
}

module.exports = { markerName, assertSafeProfileDirectory, markProfileOwned, isProfileOwnedBy };
