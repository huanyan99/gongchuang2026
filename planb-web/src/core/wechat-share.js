import { request } from './api.js';

const TITLE = '柏楚2026价值共创峰会';
const DESC = '智践于行，增长共生';
const IMAGE = 'https://pmt.fscut.com/assets/share-cover.png';
let configuredUrl = '';
let readyPromise = null;

function inWechat() {
  return /MicroMessenger/i.test(navigator.userAgent) && window.wx;
}

function shareData() {
  return { title: TITLE, desc: DESC, link: location.href, imgUrl: IMAGE };
}

function applyShareData() {
  if (!window.wx) return;
  const data = shareData();
  window.wx.updateAppMessageShareData(data);
  window.wx.updateTimelineShareData({ title: TITLE, link: data.link, imgUrl: IMAGE });
}

/** 当前页面 URL（不含 hash）参与签名；分享链接保留邀请码和当前页面。 */
export function configureWechatShare() {
  if (!inWechat()) return Promise.resolve(false);
  const signUrl = location.href.split('#')[0];
  if (readyPromise && configuredUrl === signUrl) {
    return readyPromise.then(() => { applyShareData(); return true; });
  }
  configuredUrl = signUrl;
  readyPromise = request(`/api/wechat/js-sdk-signature?url=${encodeURIComponent(signUrl)}`, 'GET', {}, {}, { silent: true, skipRetry: true })
    .then((signature) => new Promise((resolve, reject) => {
      window.wx.config({
        debug: false,
        appId: signature.appId,
        timestamp: signature.timestamp,
        nonceStr: signature.nonceStr,
        signature: signature.signature,
        jsApiList: ['updateAppMessageShareData', 'updateTimelineShareData'],
      });
      window.wx.ready(() => { applyShareData(); resolve(true); });
      window.wx.error((error) => reject(error));
    }))
    .catch((error) => {
      console.warn('微信分享配置失败', error && (error.errMsg || error.message || error.code));
      return false;
    });
  return readyPromise;
}
