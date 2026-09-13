/**
 * 运行时配置。部署后修改本文件即可，无需重新构建。
 *
 * demoMode: true  使用浏览器本地演示数据（无需后端，数据存 localStorage）
 * demoMode: false 调用 apiBase 指向的正式后端，登录走「手机号 + 姓名」向导
 *                 （后端 POST /api/auth/phone-login，无验证码）
 * oauthAppid:     公众号网页授权 AppID（需认证服务号）。默认留空；
 *                 配置后未登录访问会先跳微信静默授权（备用通道，当前未启用）。
 * hallImages:     桌位图页的全场位置图，把图片放进 assets/ 后按场次填写路径，
 *                 留空则显示占位框。也可填写 https 图片地址。
 */
window.PLANB_CONFIG = {
  apiBase: '',
  demoMode: true,
  token: '',
  oauthAppid: '',
  timeout: 15000,
  hallImages: {
    上海: '',
    济南: '',
    佛山: '',
  },
};
