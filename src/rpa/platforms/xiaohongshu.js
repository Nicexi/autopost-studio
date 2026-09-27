const { RpaError } = require('../errors');
const fs = require('node:fs');
const path = require('node:path');
const { sleep, firstLocator, setFile } = require('./shared');

const videoInputs = ['input[type="file"][accept*="video"]', 'input[type="file"][accept*="mp4"]', 'input[type="file"]'];
// Do not fall back to an untyped file input: the page also owns a video input.
const imageInputs = ['input[type="file"][accept*="image"]'];

async function coverUiDiagnostic(page) {
  return page.evaluate(() => [...document.querySelectorAll('button,[role="button"],input')]
    .filter((node) => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; })
    .map((node) => (node.innerText || node.getAttribute('aria-label') || node.getAttribute('placeholder') || '').trim())
    .filter((text) => /封面|上传|确定|完成/.test(text)).slice(0, 12)).catch(() => []);
}

async function uploadVideo(page, job, log = () => {}) {
  const video = job.file || job.video;
  if (!video) throw new RpaError('VIDEO_REQUIRED', '小红书缺少视频素材');
  await firstLocator(page, videoInputs, 10000, false);
  const uploaded = await setFile(page, videoInputs, video);
  if (!uploaded) throw new RpaError('VIDEO_INPUT_NOT_FOUND', '小红书未找到上传视频控件');
  log(`小红书视频素材已注入：${video}`);
  await sleep(250);
  log('小红书视频上传已启动，继续填写内容');
}

async function uploadCover(page, job, log = () => {}) {
  const cover = job.cover || job.verticalCover || job.horizontalCover;
  if (!cover) return false;
  // XHS requires opening its cover editor before the dialog's image input is
  // created. This clicks a webpage button only; the native file input is
  // never clicked.
  // The edit control is rendered as a hover overlay on the current cover
  // card.  Without hovering first, the DOM node exists but has zero size and
  // Playwright correctly treats it as not visible.
  // Prefer the actual cover image over its large section wrapper.  A
  // combined CSS selector is returned in DOM order, which otherwise picks
  // the wrapper first and moves the mouse away from the hover overlay.
  let coverCard = page.locator('.cover--origin, .cover--row > .default').first();
  if (!(await coverCard.count())) coverCard = page.locator('.cover--row, .publish-page-content-cover, [class*="cover-preview"]').first();
  await coverCard.scrollIntoViewIfNeeded().catch(() => {});
  await coverCard.hover({ force: true }).catch(() => {});
  await sleep(250);
  const trigger = await firstLocator(page, [
    '.cover-edit-entry',
    '.cover-edit-entry-text',
    '.cover--origin .default.origin',
    '.cover--origin .coverDetectTag',
    'button:has-text("编辑封面")',
    '[role="button"]:has-text("编辑封面")',
    '[class*="cover"]:has-text("编辑封面")',
    'text=编辑封面',
    'text=设置封面',
    'text=更换封面',
    'text=设置封面',
  ], 45000);
  if (!trigger) { log(`小红书未找到编辑封面按钮（当前控件：${(await coverUiDiagnostic(page)).join('、') || '无'}）`); return false; }
  await trigger.scrollIntoViewIfNeeded().catch(() => {});
  await trigger.click({ force: true }).catch(() => {});
  await sleep(700);
  const coverSelectors = [
    '[role="dialog"] input[type="file"][accept*="image"]',
    '.el-dialog input[type="file"][accept*="image"]',
    '.d-modal input.upload-input[type="file"][accept*="image"]',
    '.d-modal input[type="file"][accept*="image"]',
    '[class*="modal"] [class*="upload"] input[type="file"]',
    '[class*="cover"] [class*="upload"] input[type="file"]',
    ...imageInputs,
  ];
  let imageInput = await firstLocator(page, coverSelectors, 2500, false);
  let uploaded = false;
  if (imageInput) {
    uploaded = await setFile(page, coverSelectors, cover, { dispatchEvents: true, forcePayload: true, mimeType: 'image/*' });
  } else {
    // Some XHS builds mount the image input only after the upload control is
    // activated. Intercept the chooser so no native OS dialog is displayed.
    const upload = await firstLocator(page, [
      '.d-modal button.btn-upload',
      '.d-modal button:has-text("上传图片")',
      '[role="dialog"] button:has-text("上传图片")',
      '[role="dialog"] button:has-text("上传封面")',
      '.el-dialog button:has-text("上传图片")',
      '.el-dialog button:has-text("上传封面")',
      'button:has-text("上传图片")',
      'button:has-text("上传封面")',
      'text=上传图片',
      'text=上传封面',
    ], 10000);
    if (!upload) { log(`小红书封面弹窗未找到上传图片按钮（当前控件：${(await coverUiDiagnostic(page)).join('、') || '无'}）`); return false; }
    await upload.scrollIntoViewIfNeeded().catch(() => {});
    const chooserPromise = page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null);
    await upload.click({ force: true }).catch(() => {});
    const chooser = await chooserPromise;
    if (chooser) {
      const extension = path.extname(cover).toLowerCase();
      const mimeType = extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg';
      await chooser.setFiles({ name: path.basename(cover), mimeType, buffer: fs.readFileSync(cover) });
      uploaded = true;
    } else {
      imageInput = await firstLocator(page, coverSelectors, 10000, false);
      if (imageInput) uploaded = await setFile(page, coverSelectors, cover, { dispatchEvents: true, forcePayload: true, mimeType: 'image/*' });
    }
  }
  if (!uploaded) {
    log('小红书封面弹窗未挂载图片控件');
    return false;
  }
  if (uploaded) {
    let confirmed = false;
    log(`小红书封面已注入：${cover}`);
    await sleep(1200);
    const done = await firstLocator(page, [
      '[role="dialog"] button:has-text("确定")',
      '.el-dialog button:has-text("确定")',
      'button:has-text("确定")',
      'text=确定',
    ], 5000);
    if (done) {
      await done.scrollIntoViewIfNeeded().catch(() => {});
      await done.click({ force: true }).catch(() => {});
      confirmed = true;
      log('小红书封面编辑已点击确定');
    }
    if (!confirmed) log('小红书未找到封面确定按钮');
    return uploaded && confirmed;
  }
  return false;
}

module.exports = { uploadVideo, uploadCover };
