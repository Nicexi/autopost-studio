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
  // Douyin only mounts the cover input after the web cover editor is opened.
  // Click the editor control, never the file input itself.
  const trigger = await firstLocator(page, ['text=编辑封面', 'button:has-text("编辑封面")', 'text=设置封面', 'text=更换封面'], 10000);
  if (trigger) {
    await trigger.click({ force: true }).catch(() => {});
    await sleep(800);
  }
  const upload = await firstLocator(page, ['text=上传封面', 'button:has-text("上传封面")'], 5000);
  if (upload) {
    await upload.click({ force: true }).catch(() => {});
    await sleep(500);
  }
  const imageInput = await firstLocator(page, coverInputs, 10000, false);
  if (!imageInput) {
    log('抖音封面编辑器未挂载图片控件');
    return false;
  }
  const uploaded = await setFile(page, coverInputs, cover);
  if (uploaded) {
    log(`抖音封面已注入：${cover}`);
    await sleep(1200);
    const done = await firstLocator(page, ['text=完成', 'button:has-text("完成")'], 5000);
    if (done) {
      await done.click({ force: true }).catch(() => {});
      log('抖音封面编辑已点击完成');
    } else {
      log('抖音未找到封面完成按钮');
    }
  }
  return uploaded;
}

module.exports = { uploadVideo, uploadCover };
