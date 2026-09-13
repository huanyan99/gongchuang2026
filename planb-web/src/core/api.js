/**
 * 请求层：与小程序 app.js 的 request / ensureLogin 语义一致。
 * - 后端约定 code === 0 为成功，data 为业务数据；其余为错误码
 * - 401（1001）自动重新登录并重试一次
 * - silent 选项与错误码 3002（未登记）不弹提示
 */

import { getStorage, setStorage, removeStorage } from './storage.js';
import { toast } from './ui.js';

const DEFAULTS = {
  apiBase: '',
  token: '',
  timeout: 15000,
};

export const config = { ...DEFAULTS, ...(window.PLANB_CONFIG || {}) };

const IDENTITY_KEYS = [
  'token',
  'activeInviteCode',
  'lastApplyPhone',
  'bochuMemberProfile',
  'bochuApplyProfile',
  'bochuLuckyNumber',
  'authUserId',
  'passScoped',
  'oauthState',
  'oauthHash',
];

export const session = {
  token: null,
  userInfo: null,
};

/** 本机设备识别码：首次生成后长期保存，用于「一个账号一台设备」限制 */
export function deviceId() {
  let id = getStorage('deviceId');
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : `web-${Date.now()}-${Math.random().toString(16).slice(2)}`)
      .replace(/-/g, '');
    setStorage('deviceId', id);
  }
  return id;
}

/**
 * 当前登录状态：
 * - full 正常登录，可用全部功能
 * - pass 现场通道会话，只能看抽奖码与桌位
 * - none 未登录
 */
export function authState() {
  const token = session.token || getStorage('token') || config.token;
  if (!token) return 'none';
  return getStorage('passScoped') ? 'pass' : 'full';
}

export function clearIdentityCache() {
  IDENTITY_KEYS.forEach(removeStorage);
  session.token = null;
  session.userInfo = null;
}

function applyLoginSession(data) {
  const nextUserId = data && data.user && data.user.id ? String(data.user.id) : '';
  const previousUserId = String(getStorage('authUserId') || '');
  if (previousUserId && nextUserId && previousUserId !== nextUserId) {
    clearIdentityCache();
  }
  session.token = data.token;
  session.userInfo = data.user;
  setStorage('token', data.token);
  if (nextUserId) setStorage('authUserId', nextUserId);
}

export function ensureLogin() {
  if (session.token) return Promise.resolve(session.token);

  const cached = getStorage('token') || config.token;
  if (cached) {
    session.token = cached;
    return Promise.resolve(cached);
  }
  // 页面加载后多个生命周期方法可能并发调用，只发起一次登录
  if (!loginInFlight) {
    loginInFlight = webLogin().finally(() => { loginInFlight = null; });
  }
  return loginInFlight;
}

let loginInFlight = null;

/**
 * 登录入口：
 * - 生产环境：登录页用「手机号 + 姓名」调 loginWithPhone 显式登录，不静默
 * - 公众号网页授权（snsapi_base）保留为备用通道，config.oauthAppid 配置后启用
 * 注意：邀请链接也用 ?code= 传邀请码（见 main.js），OAuth 回调以是否带 state 区分。
 */
function webLogin() {
  const params = new URLSearchParams(location.search);
  const oauthCode = params.get('code') || '';
  const oauthState = params.get('state') || '';

  if (oauthCode && oauthState) {
    const expected = String(getStorage('oauthState') || '');
    if (!expected || oauthState !== expected) {
      // state 不匹配（过期/伪造）：清理参数后按未登录处理，避免用过期 code 反复兑换
      cleanOAuthQuery();
      return Promise.reject(unauthorizedError('登录状态已过期，请重新打开页面'));
    }
    return request('/api/auth/web-login', 'POST', { code: oauthCode }, {}, { silent: true, skipRetry: true })
      .then((data) => {
        removeStorage('oauthState');
        cleanOAuthQuery();
        applyLoginSession(data);
        return session.token;
      })
      .catch((err) => {
        removeStorage('oauthState');
        cleanOAuthQuery();
        return Promise.reject(unauthorizedError((err && err.message) || '微信授权登录失败，请在微信中重新打开页面'));
      });
  }

  if (config.oauthAppid) {
    if (!/MicroMessenger/i.test(navigator.userAgent)) {
      return Promise.reject(unauthorizedError('请使用微信打开本页面完成登录'));
    }
    return startOAuth();
  }
  // 未配置公众号授权：由登录页用手机号+姓名显式登录
  return Promise.reject(unauthorizedError('请先使用手机号和姓名登录'));
}

function startOAuth() {
  setStorage('oauthHash', location.hash || '#/');
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  setStorage('oauthState', state);
  const authorize = 'https://open.weixin.qq.com/connect/oauth2/authorize'
    + '?appid=' + encodeURIComponent(config.oauthAppid)
    + '&redirect_uri=' + encodeURIComponent(location.origin + location.pathname)
    + '&response_type=code&scope=snsapi_base'
    + '&state=' + state
    + '#wechat_redirect';
  location.href = authorize;
  // 已跳离页面，promise 永不落定
  return new Promise(() => {});
}

function cleanOAuthQuery() {
  const hash = String(getStorage('oauthHash') || '') || location.hash || '#/';
  removeStorage('oauthHash');
  history.replaceState(null, '', location.origin + location.pathname + hash);
}

function unauthorizedError(message) {
  return { code: 1001, stage: '微信授权', message };
}

export function relogin() {
  session.token = null;
  removeStorage('token');
  return ensureLogin();
}

function networkMessage(error) {
  if (error && error.name === 'AbortError') return '连接后端超时，请检查网络';
  return '无法连接后端，请检查服务地址、网络和跨域配置';
}

/**
 * @param {string} path 接口路径，例如 /api/apply/me
 * @param {'GET'|'POST'|'PUT'|'DELETE'} method
 * @param {object} data GET 时忽略，其余作为 JSON body
 * @param {object} extraHeader 附加请求头，例如 X-Admin-Key
 * @param {{silent?: boolean, skipRetry?: boolean}} options
 */
export function request(path, method = 'GET', data = {}, extraHeader = {}, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeout);

  return fetch(config.apiBase + path, {
    method,
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: session.token || getStorage('token') || '',
      'X-Device-Id': deviceId(),
      ...extraHeader,
    },
    body: method === 'GET' ? undefined : JSON.stringify(data),
  })
    .then((response) => response.json().catch(() => ({ code: -1, message: '返回数据解析失败' })))
    .then((body) => {
      if (body && body.code === 0) return body.data;

      const error = body && typeof body === 'object' ? body : { code: -1, message: '请求失败' };
      if (error.code === 1001 && !options.skipRetry && path !== '/api/auth/login' && path !== '/api/auth/web-login') {
        return relogin().then(() => request(path, method, data, extraHeader, { ...options, skipRetry: true }));
      }
      if (!options.silent && error.code !== 3002) toast(error.message || '请求失败');
      return Promise.reject(error);
    })
    .catch((error) => {
      if (error && typeof error.code === 'number') return Promise.reject(error);
      const failure = { code: -1, stage: '网络请求', message: networkMessage(error) };
      if (!options.silent) toast(failure.message);
      return Promise.reject(failure);
    })
    .finally(() => clearTimeout(timer));
}

/** 手机号在参会登记中的姓名掩码，用于登录时补全姓名核验身份 */
export function phoneHint(phone) {
  return request('/api/auth/phone-hint', 'POST', { phone: String(phone).trim() }, {}, { silent: true, skipRetry: true })
    .catch(() => ({ known: false, maskedName: '', missingCount: 0 }));
}

/** 网页版登录：手机号 + 姓名（无验证码，后端按手机号建立/认领身份） */
export function loginWithPhone(phone, name) {
  return request('/api/auth/phone-login', 'POST', { phone: String(phone).trim(), name: String(name).trim() }, {}, { skipRetry: true })
    .then((data) => {
      applyLoginSession(data);
      return session.token;
    });
}

/**
 * 现场通道：扫码带 pass 参数，只验证姓名换取查看抽奖码与桌位的会话。
 * 同名多人时后端返回 needPhoneTail，让嘉宾补手机号后四位。
 */
export function passLogin(pass, name, phoneTail) {
  return request('/api/pass/session', 'POST', { pass, name, phoneTail }, {}, { skipRetry: true })
    .then((data) => {
      if (data && data.needPhoneTail) return data;
      session.token = data.token;
      setStorage('token', data.token);
      setStorage('passScoped', true);
      return data;
    });
}

export const api = { config, session, request, ensureLogin, relogin, clearIdentityCache, deviceId, authState };
