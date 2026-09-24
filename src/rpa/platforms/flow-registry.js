const { platformFlows } = require('./platform-flows');
const { publishUrls } = require('./publisher-flows');
Object.entries(publishUrls).forEach(([platform, publishUrl]) => { if (platformFlows[platform]) platformFlows[platform].publishUrl = publishUrl; });
function getPlatformFlow(platform) { const flow = platformFlows[platform]; if (!flow) throw new Error(`未配置平台流程: ${platform}`); return flow; }
module.exports = { getPlatformFlow, platformFlows };
