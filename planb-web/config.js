/**
 * 运行时配置。部署后修改本文件即可，无需重新构建。
 *
 * demoMode: true  使用浏览器本地演示数据（无需后端，数据存 localStorage）
 * demoMode: false 调用 apiBase 指向的正式后端；浏览器没有 wx.login，
 *                 需要先由公众号 OAuth / 短信 / 企业统一身份认证换取 token，
 *                 写入 token 字段或 localStorage 的 bochu:token。
 * hallImages:     桌位图页的全场位置图，把图片放进 assets/ 后按场次填写路径，
 *                 留空则显示占位框。也可填写 https 图片地址。
 */
window.PLANB_CONFIG = {
  apiBase: '',
  demoMode: true,
  token: '',
  timeout: 15000,
  hallImages: {
    上海: '',
    济南: '',
    佛山: '',
  },
};
