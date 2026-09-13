/**
 * 运行时配置。部署后修改本文件即可，无需重新构建。
 *
 * demoMode: false 正式模式，调用 apiBase 指向的后端，登录走「手机号 + 姓名」向导
 *                 （后端 POST /api/auth/phone-login，无验证码）
 * demoMode: true  本地预览用：不连后端，数据存在浏览器 localStorage。
 *                 仅供本机调试，部署前务必保持 false，否则页面展示的是演示数据。
 * oauthAppid:     公众号网页授权 AppID（需认证服务号）。默认留空；
 *                 配置后未登录访问会先跳微信静默授权（备用通道，当前未启用）。
 * privacyPopup:   首页隐私协议弹窗；当前关闭，协议入口保留在个人中心底部
 * hallImages:     桌位图页的全场位置图，把图片放进 assets/ 后按场次填写路径，
 *                 留空则显示占位框。也可填写 https 图片地址。
 */
window.PLANB_CONFIG = {
  apiBase: '',
  demoMode: false,
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
