const { RpaError } = require('../errors');
const { sleep, firstLocator, setFile } = require('./shared');

const videoInputs = [
  'input[type="file"][accept*="video"]',
  'input[type="file"][accept*="mp4"]',
  'input[type="file"]'
];
// Semi's upload class is shared by video and image controls. Always require
// an image accept hint so CDP cannot inject the cover into the video input.
const coverInputs = [
  'div.semi-upload[class*="upload-"] input.semi-upload-hidden-input',
  'div.upload-BvM5FF input.semi-upload-hidden-input',
  'input.upload-btn-input-UY_qeY[type="file"][accept*="image"]',
  'input[class*="upload-btn-input"][type="file"][accept*="image"]',
  'input.semi-upload-hidden-input[type="file"][accept*="image"]',
  'input[type="file"][accept*="image"]',
];

async function coverUiDiagnostic(page) {
  return page.evaluate(() => [...document.querySelectorAll('button,[role="button"],input')]
    .filter((node) => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; })
    .map((node) => (node.innerText || node.getAttribute('aria-label') || node.getAttribute('placeholder') || '').trim())
    .filter((text) => /封面|上传|保存|完成/.test(text)).slice(0, 12)).catch(() => []);
}

async function uploadVideo(page, job, log = () => {}) {
  const video = job.file || job.video;
  if (!video) throw new RpaError('VIDEO_REQUIRED', '抖音缺少视频素材');
  await firstLocator(page, videoInputs, 10000, false);
  const uploaded = await setFile(page, videoInputs, video);
  if (!uploaded) throw new RpaError('VIDEO_INPUT_NOT_FOUND', '抖音未找到上传视频控件');
  log(`抖音视频素材已注入：${video}`);
  await sleep(250);
  log('抖音视频上传已启动，继续填写内容');
}

async function uploadCover(page, job, log = () => {}) {
  const cover = job.cover || job.verticalCover || job.horizontalCover;
  if (!cover) return false;
  // Douyin renders the edit overlay only while the cover card is hovered.
  const coverCard = page.locator('[class^="coverControl-"], [class*="coverControl-"], [class^="cover-"] [class*="background-"]').first();
  await coverCard.hover({ force: true }).catch(() => {});
  await sleep(250);
  // Douyin only mounts the cover input after the web cover editor is opened.
  // Click the editor control, never the file input itself.
  const trigger = await firstLocator(page, [
    '[class^="filter-"]:has-text("选择封面")',
    '[class*="filter-"]:has-text("选择封面")',
    '.title-wA45Xd:has-text("选择封面")',
    'text=选择封面',
    'button:has-text("编辑封面")',
    '[role="button"]:has-text("编辑封面")',
    '[class*="cover"]:has-text("编辑封面")',
    'text=编辑封面',
    'text=设置封面',
    'text=更换封面',
  ], 45000);
  if (trigger) {
    await trigger.scrollIntoViewIfNeeded().catch(() => {});
    await trigger.click({ force: true }).catch(() => {});
    await sleep(800);
  }
  // Never click the upload label: it opens the operating-system file chooser.
  // The hidden image input is mounted by the editor and can be injected via CDP.
  const imageInput = await firstLocator(page, coverInputs, trigger ? 15000 : 3000, false);
  if (!trigger && !imageInput) { log(`抖音未找到封面编辑入口（当前控件：${(await coverUiDiagnostic(page)).join('、') || '无'}）`); return false; }
  if (!imageInput) {
    log('抖音封面编辑器未挂载图片控件');
    return false;
  }
  const uploaded = await setFile(page, coverInputs, cover, { dispatchEvents: true, forcePayload: true, mimeType: 'image/*' });
  if (uploaded) {
    let saved = false;
    log(`抖音封面已注入：${cover}`);
    await sleep(1200);
    const done = await firstLocator(page, [
      // The creator cover editor uses a modal-scoped “完成” button.  Keep
      // modal selectors first so labels such as the page-level “保存权限”
      // cannot be mistaken for the cover confirmation action.
      '[role="dialog"] button:has-text("完成")',
      '.dy-creator-content-modal button:has-text("完成")',
      '[role="dialog"] button:has-text("保存")',
      '.dy-creator-content-modal button:has-text("保存")',
      'button:has-text("完成")',
      'button:has-text("保存")',
    ], 10000);
    if (done) {
      await done.scrollIntoViewIfNeeded().catch(() => {});
      await done.click({ force: true }).catch(() => {});
      await sleep(500);
      const modalStillOpen = await firstLocator(page, [
        '.dy-creator-content-modal[role="dialog"]',
        '[role="dialog"].dy-creator-content-modal',
      ], 800, true);
      saved = !modalStillOpen;
      if (saved) log('抖音封面编辑已确认（保存/完成）');
      else log('抖音封面完成按钮已点击，但编辑器仍未关闭');
    } else {
      log('抖音未找到封面保存或完成按钮');
    }
    return uploaded && saved;
  }
  return false;
}

module.exports = { uploadVideo, uploadCover };
