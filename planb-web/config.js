/**
 * 运行时配置。部署后修改本文件即可，无需重新构建。
 *
 * demoMode: true  使用浏览器本地演示数据（无需后端，数据存 localStorage）
 * demoMode: false 调用 apiBase 指向的正式后端；浏览器没有 wx.login，
 *                 需要先由公众号 OAuth / 短信 / 企业统一身份认证换取 token，
 *                 写入 token 字段或 localStorage 的 bochu:token。
 */
window.PLANB_CONFIG = {
  apiBase: '',
  demoMode: true,
  token: '',
  timeout: 15000,
};
