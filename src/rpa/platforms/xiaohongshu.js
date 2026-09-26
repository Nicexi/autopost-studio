const { RpaError } = require('../errors');
const { sleep, firstLocator, setFile } = require('./shared');

const videoInputs = ['input[type="file"][accept*="video"]', 'input[type="file"][accept*="mp4"]', 'input[type="file"]'];
const imageInputs = ['input[type="file"][accept*="image"]', 'input[type="file"]'];

async function uploadVideo(page, job, log = () => {}) {
  const video = job.file || job.video;
  if (!video) throw new RpaError('VIDEO_REQUIRED', '小红书缺少视频素材');
  await firstLocator(page, videoInputs, 10000, false);
  const uploaded = await setFile(page, videoInputs, video);
  if (!uploaded) throw new RpaError('VIDEO_INPUT_NOT_FOUND', '小红书未找到上传视频控件');
  log(`小红书视频素材已注入：${video}`);
  await sleep(2500);
}

async function uploadCover(page, job, log = () => {}) {
  const cover = job.cover || job.verticalCover || job.horizontalCover;
  if (!cover) return false;
  // XHS requires opening its cover editor before the dialog's image input is
  // created. This clicks a webpage button only; the native file input is
  // never clicked.
  const trigger = await firstLocator(page, [
    'text=编辑封面',
    'button:has-text("编辑封面")',
    '[class*="cover"] [role="button"]',
    '[class*="cover"] button'
  ], 10000);
  if (trigger) {
    await trigger.click({ force: true }).catch(() => {});
    await sleep(700);
  }
  const upload = await firstLocator(page, ['text=上传封面', 'button:has-text("上传封面")'], 5000);
  if (upload) {
    await upload.click({ force: true }).catch(() => {});
    await sleep(500);
  }
  const imageInput = await firstLocator(page, imageInputs, 10000, false);
  if (!imageInput) {
    log('小红书封面弹窗未挂载图片控件');
    return false;
  }
  const uploaded = await setFile(page, imageInputs, cover);
  if (uploaded) {
    log(`小红书封面已注入：${cover}`);
    await sleep(1200);
    const done = await firstLocator(page, ['text=确定', 'button:has-text("确定")'], 5000);
    if (done) {
      await done.click({ force: true }).catch(() => {});
      log('小红书封面编辑已点击确定');
    }
  }
  return uploaded;
}

module.exports = { uploadVideo, uploadCover };
