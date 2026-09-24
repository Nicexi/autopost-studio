const fs = require('fs');
const path = require('path');
const { ensureFingerprint } = require('./fingerprint-profiles');

const platformDirectories = { X: 'x', 小红书: 'xiaohongshu', 抖音: 'douyin', 快手: 'kuaishou', 微信公众号: 'wechat', 西瓜视频: 'xigua', 知乎: 'zhihu', 掘金: 'juejin' };

class ProfileManager {
  constructor({ app, state }) { this.app = app; this.state = state; }
  resolve(account) {
    const root = this.state.settings.cacheRoot || path.join(this.app.getPath('userData'), 'profiles');
    const directory = account.cacheDir || path.join(root, platformDirectories[account.platform] || 'other', account.id);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    ensureFingerprint(account);
    return directory;
  }
}

module.exports = { ProfileManager, platformDirectories };
