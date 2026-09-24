const path = require('path');
const { BasePublisher } = require('./base');

const PLATFORM_DEFINITIONS = {
  X: { key: 'x', modes: ['video', 'article'], automation: 'browser' },
  小红书: { key: 'xiaohongshu', modes: ['video', 'article'], automation: 'browser' },
  抖音: { key: 'douyin', modes: ['video', 'article'], automation: 'browser' },
  快手: { key: 'kuaishou', modes: ['video', 'article'], automation: 'browser' },
  微信公众号: { key: 'wechat', modes: ['article'], automation: 'browser' },
  微信视频号: { key: 'wechat-channels', modes: ['video'], automation: 'browser' },
  西瓜视频: { key: 'xigua', modes: ['video'], automation: 'browser' },
  哔哩哔哩: { key: 'bilibili', modes: ['video'], automation: 'browser' },
  知乎: { key: 'zhihu', modes: ['video', 'article'], automation: 'browser' },
  掘金: { key: 'juejin', modes: ['article'], automation: 'browser' }
};

class PendingPublisher extends BasePublisher {
  async publish() {
    const error = new Error(`${this.platform} 的页面发布器正在接入，账号会话模型已就绪`);
    error.code = 'ADAPTER_PENDING';
    throw error;
  }
}

function createPublisher({ platform, account, userDataPath }) {
  const definition = PLATFORM_DEFINITIONS[platform];
  if (!definition) throw new Error(`未知平台: ${platform}`);
  return new PendingPublisher({ platform, account, profileDir: path.join(userDataPath, 'profiles', definition.key, account.id) });
}

function getPlatformDefinitions() { return PLATFORM_DEFINITIONS; }

module.exports = { createPublisher, getPlatformDefinitions };
