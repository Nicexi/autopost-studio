const { RpaError } = require('../errors');
const { sleep, firstLocator, setFile } = require('./shared');

const videoInputs = [
  'input[type="file"][accept*="video"]',
  'input[type="file"][accept*="mp4"]',
  'input[type="file"]'
];
const coverInputs = ['input.semi-upload-hidden-input', 'input[type="file"][accept*="image"]'];

async function uploadVideo(page, job, log = () => {}) {
  const video = job.file || job.video;
  if (!video) throw new RpaError('VIDEO_REQUIRED', '抖音缺少视频素材');
  await firstLocator(page, videoInputs, 10000, false);
  const uploaded = await setFile(page, videoInputs, video);
  if (!uploaded) throw new RpaError('VIDEO_INPUT_NOT_FOUND', '抖音未找到上传视频控件');
  log(`抖音视频素材已注入：${video}`);
  await sleep(2500);
}

async function uploadCover(page, job, log = () => {}) {
  const cover = job.cover || job.verticalCover || job.horizontalCover;
  if (!cover) return false;
  await firstLocator(page, coverInputs, 10000, false);
  const uploaded = await setFile(page, coverInputs, cover);
  if (uploaded) {
    log(`抖音封面已注入：${cover}`);
    await sleep(1200);
    const done = await firstLocator(page, ['text=保存', 'button:has-text("保存")'], 5000);
    if (done) {
      await done.click({ force: true }).catch(() => {});
      log('抖音封面编辑已点击保存');
    } else {
      log('抖音未找到封面保存按钮');
    }
  }
  return uploaded;
}

module.exports = { uploadVideo, uploadCover };
