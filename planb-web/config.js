/**
 * 运行时配置。部署后修改本文件即可，无需重新构建。
 *
 * apiBase:        后端地址，与网页同源部署时留空；跨域部署填完整地址，
 *                 并在后端 app.cors.allowed-origins 放通本页面来源。
 * oauthAppid:     公众号网页授权 AppID（需认证服务号）。默认留空；
 *                 配置后未登录访问会先跳微信静默授权（备用通道，当前未启用）。
 * privacyPopup:   首页隐私协议弹窗；当前关闭，协议入口保留在个人中心底部
 * hallImages:     桌位图页的全场位置图，把图片放进 assets/ 后按场次填写路径，
 *                 留空则显示占位框。也可填写 https 图片地址。
 */
window.PLANB_CONFIG = {
  // 生产环境由 Nginx 将同源 /api 转发到 127.0.0.1:4556，避免跨域。
  apiBase: '',
  token: '',
  oauthAppid: '',
  timeout: 15000,
  privacyPopup: false,
  hallImages: {
    上海: '',
    济南: '',
    佛山: '',
  },
};
