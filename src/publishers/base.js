const fs = require('fs');
const path = require('path');

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.m4v', '.webm', '.flv', '.wmv']);
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);

class PublisherError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

class BasePublisher {
  constructor({ platform, account, profileDir }) {
    this.platform = platform;
    this.account = account;
    this.profileDir = profileDir;
  }

  validateVideo(filePath) {
    return validateFile(filePath, VIDEO_EXTENSIONS, '视频');
  }

  validateImages(filePaths) {
    if (!Array.isArray(filePaths) || filePaths.length === 0) throw new PublisherError('IMAGE_REQUIRED', '图文内容至少需要一张图片');
    return filePaths.map(filePath => validateFile(filePath, IMAGE_EXTENSIONS, '图片'));
  }

  validateSchedule(publishAt) {
    if (!publishAt) return null;
    const timestamp = new Date(publishAt).getTime();
    if (!Number.isFinite(timestamp) || timestamp <= Date.now()) throw new PublisherError('INVALID_SCHEDULE', '定时发布时间必须晚于当前时间');
    if (timestamp - Date.now() < 2 * 60 * 60 * 1000) throw new PublisherError('SCHEDULE_TOO_SOON', '定时发布时间必须至少提前 2 小时');
    return new Date(timestamp).toISOString();
  }

  normalizePayload(input) {
    if (!input || !input.title?.trim()) throw new PublisherError('TITLE_REQUIRED', '标题不能为空');
    return {
      title: input.title.trim(),
      description: (input.description || '').trim(),
      tags: Array.isArray(input.tags) ? input.tags : String(input.tags || '').split(/[#,，\s]+/).filter(Boolean),
      topics: Array.isArray(input.topics) ? input.topics : String(input.topics || '').split(/[#,，\s]+/).filter(Boolean),
      mentions: Array.isArray(input.mentions) ? input.mentions : String(input.mentions || '').split(/[,，\s]+/).filter(Boolean),
      collection: input.collection || '',
      cover: input.cover || '',
      verticalCover: input.verticalCover || '',
      horizontalCover: input.horizontalCover || '',
      articleCover: input.articleCover || '',
      publishAt: this.validateSchedule(input.publishAt),
      visibility: input.visibility || 'public'
    };
  }

  async checkSession() {
    return fs.existsSync(path.join(this.profileDir, 'session.json'));
  }

  async login() { throw new PublisherError('NOT_IMPLEMENTED', `${this.platform} 发布器尚未实现登录流程`); }
  async publish() { throw new PublisherError('NOT_IMPLEMENTED', `${this.platform} 发布器尚未实现发布流程`); }
}

function validateFile(filePath, extensions, label) {
  if (!filePath || typeof filePath !== 'string') throw new PublisherError('FILE_REQUIRED', `${label}文件不能为空`);
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) throw new PublisherError('FILE_NOT_FOUND', `${label}文件不存在: ${absolutePath}`);
  if (!fs.statSync(absolutePath).isFile()) throw new PublisherError('NOT_A_FILE', `${label}路径不是文件: ${absolutePath}`);
  const extension = path.extname(absolutePath).toLowerCase();
  if (!extensions.has(extension)) throw new PublisherError('UNSUPPORTED_FORMAT', `不支持的${label}格式: ${extension}`);
  return absolutePath;
}

module.exports = { BasePublisher, PublisherError, VIDEO_EXTENSIONS, IMAGE_EXTENSIONS };
