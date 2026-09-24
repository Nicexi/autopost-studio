const fs = require('fs');
const path = require('path');

function ensureProfile(userDataPath, platformKey, accountId, customDir = '') {
  const profileDir = customDir || path.join(userDataPath, 'profiles', platformKey, accountId);
  fs.mkdirSync(profileDir, { recursive: true, mode: 0o700 });
  return profileDir;
}

module.exports = { ensureProfile };
