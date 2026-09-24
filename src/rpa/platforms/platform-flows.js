const platformFlows = {
  X: { loginUrl: 'https://x.com/compose/post', sessionCookies: ['auth_token', 'ct0'], selectors: ['[data-testid="SideNav_AccountSwitcher_Button"]', '[data-testid="AppTabBar_Profile_Link"]'] },
  小红书: { loginUrl: 'https://creator.xiaohongshu.com/', sessionCookies: ['web_session', 'a1', 'webId'], selectors: ['[class*="avatar"]', '[class*="user-info"]', '[class*="account"]'] },
  抖音: { loginUrl: 'https://creator.douyin.com/creator-micro/home', sessionCookies: ['sessionid', 'sessionid_ss', 'passport_csrf_token', 'passport_csrf_token_default', 'sid_guard', 'sid_tt', 'uid_tt', 'uid_tt_ss', 'odin_tt', 'ttwid'], selectors: ['[class*="avatar"]', '[class*="account"]', '[data-e2e*="avatar"]', '[class*="userInfo"]'], verifyEndpoint: 'https://creator.douyin.com/web/api/media/user/info/' },
  快手: { loginUrl: 'https://cp.kuaishou.com/', sessionCookies: ['kuaishou.server.web_st', 'userId', 'kuaishou.server.web_ph'], selectors: ['[class*="avatar"]', '[class*="user"]', '[class*="account"]'] },
  微信公众号: { loginUrl: 'https://mp.weixin.qq.com/', sessionCookies: ['slave_sid', 'mm_lang', 'wxuin', 'data_ticket'], selectors: ['#header_info', '[class*="account"]', '[class*="nickname"]'] },
  西瓜视频: { loginUrl: 'https://studio.ixigua.com/', sessionCookies: ['sessionid', 'sessionid_ss', 'passport_csrf_token', 'sid_guard'], selectors: ['[class*="avatar"]', '[class*="account"]', '[class*="user"]'] },
  知乎: { loginUrl: 'https://www.zhihu.com/creator', sessionCookies: ['z_c0', 'd_c0', 'q_c1'], selectors: ['.AppHeader-profileEntry', '[class*="Avatar"]', '[class*="Profile"]'] },
  掘金: { loginUrl: 'https://juejin.cn/creator', sessionCookies: ['sessionid', 'uid', 'user_token'], selectors: ['[class*="avatar"]', '[class*="Avatar"]', '[class*="user"]'] }
};

module.exports = { platformFlows };
