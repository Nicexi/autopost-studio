const { RpaError } = require('../errors');
const fs = require('fs');
const path = require('path');
const { sleep, firstLocator, typeLikeHuman, setFile, clickByText, schedule, runPublishFlow } = require('./shared');

const videoInput = ['input[name="buploader"][type="file"]', 'input[type="file"][accept*=".mp4"]', 'input[type="file"][accept*=".mov"]', 'input[type="file"]'];
const coverInput = ["div.bcc-upload-wrapper > input[type='file'][accept='image/png, image/jpeg']", "div.bcc-upload-wrapper input[type='file']", "input[type='file'][accept*='image']"];

async function setFileWithDataTransfer(page, selectors, filePath) {
  const locator = await firstLocator(page, selectors, 5000, false);
  if (!locator) return false;
  const stat = fs.statSync(filePath);
  // The extension creates a File in the page itself. Keep this path for
  // normal-sized assets; very large files fall back to CDP below to avoid
  // duplicating excessive data in the DevTools protocol message.
  if (stat.size > 120 * 1024 * 1024) return false;
  const data = fs.readFileSync(filePath).toString('base64');
  const extension = path.extname(filePath).toLowerCase();
  const mime = extension === '.mp4' ? 'video/mp4' : extension === '.mov' ? 'video/quicktime' : extension === '.png' ? 'image/png' : 'image/jpeg';
  await locator.evaluate((input, payload) => {
    const binary = atob(payload.data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const file = new File([bytes], payload.name, { type: payload.type });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, { data, name: path.basename(filePath), type: mime });
  return true;
}

async function waitForUpload(page, log) {
  const started = Date.now();
  let lastLog = 0;
  while (Date.now() - started < 10 * 60 * 1000) {
    const status = await page.evaluate(() => {
      const text = document.body?.innerText || '';
      return { complete: /(上传完成|上传成功|视频上传完成)/.test(text), failed: /(上传失败|上传出错|文件格式不支持)/.test(text) };
    }).catch(() => ({ complete: false, failed: false }));
    if (status.failed) throw new RpaError('BILIBILI_UPLOAD_FAILED', '哔哩哔哩报告视频上传失败');
    if (status.complete) { log('哔哩哔哩视频上传完成'); return; }
    if (Date.now() - lastLog > 10000) { log('等待哔哩哔哩视频上传完成'); lastLog = Date.now(); }
    await sleep(1000);
  }
  throw new RpaError('BILIBILI_UPLOAD_TIMEOUT', '哔哩哔哩视频上传超过 10 分钟未完成');
}

async function uploadVideo(page, job, log) {
  if (!job.file && !job.video) throw new RpaError('VIDEO_REQUIRED', '哔哩哔哩缺少视频素材');
  log('开始查找哔哩哔哩隐藏视频文件控件');
  // Do not click `.upload-area`: Bilibili opens the native file chooser there.
  const videoPath = job.file || job.video;
  const injected = await setFileWithDataTransfer(page, videoInput, videoPath) || await setFile(page, videoInput, videoPath);
  if (!injected) throw new RpaError('VIDEO_INPUT_NOT_FOUND', '哔哩哔哩未找到视频文件控件');
  log(`哔哩哔哩视频文件已注入：${job.file || job.video}`);
  await waitForUpload(page, log);
}

async function uploadCover(page, job, log) {
  const cover = job.horizontalCover || job.cover || job.verticalCover;
  if (!cover) { log('未设置哔哩哔哩封面，跳过'); return; }
  const entry = await firstLocator(page, ['div.cover-main-img > div.img', 'div.cover-main'], 10000);
  if (!entry) { log('未找到哔哩哔哩封面入口'); return; }
  await entry.click({ force: true }).catch(() => {});
  await sleep(700);
  const tab = page.locator('div.cover-select-header-tab > *:nth-child(2)').first();
  if (await tab.isVisible({ timeout: 1500 }).catch(() => false)) await tab.click({ force: true }).catch(() => {});
  const injected = await setFileWithDataTransfer(page, coverInput, cover) || await setFile(page, coverInput, cover);
  if (!injected) { log('未找到哔哩哔哩封面文件控件'); return; }
  log(`哔哩哔哩封面文件已注入：${cover}`);
  await sleep(2500);
  if (await clickByText(page, ['完成'], 3000)) log('哔哩哔哩封面上传完成');
}

async function selectDeclaration(page, value, log) {
  const declaration = value || '自制';
  const checkbox = page.locator("div.original-input-wrp input[type='checkbox']").first();
  if (await checkbox.isVisible({ timeout: 1500 }).catch(() => false)) {
    const desired = declaration === '自制';
    if ((await checkbox.isChecked().catch(() => false)) !== desired) await checkbox.click({ force: true });
    log(`哔哩哔哩创作声明已选择：${declaration}`);
    return;
  }
  const labels = page.locator('span.check-radio-v2-name');
  const count = await labels.count();
  for (let index = 0; index < count; index += 1) {
    const label = labels.nth(index);
    const text = (await label.innerText().catch(() => '')).trim();
    if (text === declaration || (declaration === '自制' && text === '原创')) { await label.click({ force: true }); log(`哔哩哔哩创作声明已选择：${declaration}`); return; }
  }
  log('未找到哔哩哔哩创作声明控件，保留平台默认值');
}

async function fill(page, job, log) {
  await uploadVideo(page, job, log);
  const title = await firstLocator(page, ['input[maxlength="80"][type="text"]', 'input.input-val[type="text"][maxlength="80"]'], 15000);
  if (!title) throw new RpaError('TITLE_INPUT_NOT_FOUND', '哔哩哔哩未找到标题输入框');
  await typeLikeHuman(title, job.title || '');
  log(`哔哩哔哩标题已填写：${job.title || ''}`);
  const editor = await firstLocator(page, ['div.ql-editor[contenteditable="true"]', 'div[contenteditable="true"]'], 15000);
  if (editor && (job.body || job.description)) await typeLikeHuman(editor, job.body || job.description);
  await selectDeclaration(page, job.creativeDeclaration, log);
  await uploadCover(page, job, log);
  await schedule(page, job.publishAt, log);
}

function publish({ page, job, log, beforePublish }) {
  return runPublishFlow({ page, platform: '哔哩哔哩', job, log, beforePublish, fill });
}

module.exports = { publish, fill };
