const CDP = require('chrome-remote-interface');
const { flows } = require('./platform-flows');

function flowFor(platform) { const flow = flows[platform]; if (!flow) throw new Error(`未配置 ${platform} 的 RPA 流程`); return flow; }

async function withPage(port, callback) {
  const client = await CDP({ port });
  try {
    const { Page, Runtime, Network } = client;
    await Promise.all([Page.enable(), Runtime.enable(), Network.enable()]);
    const tabs = await CDP.List({ port });
    const tab = tabs.find(item => item.type === 'page');
    if (!tab) throw new Error('没有找到账号浏览器页面');
    return await callback({ client, Page, Runtime, Network, tab });
  } finally { await client.close(); }
}

async function detectLogin({ platform, port }) {
  const flow = flowFor(platform);
  return withPage(port, async ({ Runtime, Network, tab }) => {
    const cookies = await Network.getAllCookies();
    const cookieMatch = cookies.cookies.some(cookie => flow.cookies.includes(cookie.name) && cookie.value);
    const selectorMatch = (await Promise.all(flow.loggedIn.map(selector => Runtime.evaluate({ expression: `Boolean(document.querySelector(${JSON.stringify(selector)}))`, returnByValue: true })))).some(result => result.result?.value === true);
    const url = tab.url || '';
    return { loggedIn: cookieMatch && selectorMatch, cookieMatch, selectorMatch, url };
  });
}

async function runLogin({ platform, port, timeoutMs = 180000 }) {
  const flow = flowFor(platform);
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try { const result = await detectLogin({ platform, port }); if (result.loggedIn) return result; } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error(`${platform} 登录等待超时，请完成扫码或账号验证后重试检测`);
}

module.exports = { detectLogin, runLogin, flowFor };
