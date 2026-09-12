/**
 * 请求层：与小程序 app.js 的 request / ensureLogin 语义一致。
 * - 后端约定 code === 0 为成功，data 为业务数据；其余为错误码
 * - 401（1001）自动重新登录并重试一次
 * - silent 选项与错误码 3002（未登记）不弹提示
 */

import { getStorage, setStorage, removeStorage } from './storage.js';
import { toast } from './ui.js';
import { demoRequest } from './demo-api.js';

const DEFAULTS = {
  apiBase: '',
  demoMode: true,
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
  'webLogged',
];

export const session = {
  token: null,
  userInfo: null,
};

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
  if (config.demoMode) {
    const data = demoRequest('/api/auth/login', 'POST');
    applyLoginSession(data);
    return Promise.resolve(data.token);
  }
  if (session.token) return Promise.resolve(session.token);

  const cached = getStorage('token') || config.token;
  if (cached) {
    session.token = cached;
    return Promise.resolve(cached);
  }
  // 浏览器没有 wx.login：正式环境需接入公众号 OAuth / 短信 / 企业统一身份认证，
  // 由接入方把换取到的 token 写入 config.token 或 localStorage 的 bochu:token。
  return Promise.reject({
    code: 1001,
    stage: '网页身份认证',
    message: '网页版尚未接入身份认证，请配置 config.token 或开启演示模式',
  });
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

function runDemo(path, method, data, options) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(demoRequest(path, method, data));
      } catch (error) {
        const failure = { code: error.code || -1, message: error.message || '请求失败' };
        if (!options.silent && failure.code !== 3002) toast(failure.message);
        reject(failure);
      }
    }, 90);
  });
}

/**
 * @param {string} path 接口路径，例如 /api/apply/me
 * @param {'GET'|'POST'|'PUT'|'DELETE'} method
 * @param {object} data GET 时忽略，其余作为 JSON body
 * @param {object} extraHeader 附加请求头，例如 X-Admin-Key
 * @param {{silent?: boolean, skipRetry?: boolean}} options
 */
export function request(path, method = 'GET', data = {}, extraHeader = {}, options = {}) {
  if (config.demoMode) return runDemo(path, method, data, options);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeout);

  return fetch(config.apiBase + path, {
    method,
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: session.token || getStorage('token') || '',
      ...extraHeader,
    },
    body: method === 'GET' ? undefined : JSON.stringify(data),
  })
    .then((response) => response.json().catch(() => ({ code: -1, message: '返回数据解析失败' })))
    .then((body) => {
      if (body && body.code === 0) return body.data;

      const error = body && typeof body === 'object' ? body : { code: -1, message: '请求失败' };
      if (error.code === 1001 && !options.skipRetry && path !== '/api/auth/login') {
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

export const api = { config, session, request, ensureLogin, relogin, clearIdentityCache };
