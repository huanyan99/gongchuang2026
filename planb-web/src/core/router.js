/**
 * 哈希路由：用页面栈复刻小程序的 navigateTo / redirectTo / navigateBack。
 * 返回时保留上一页实例与滚动位置，并触发 onShow，与小程序行为一致。
 */

import { authState } from './api.js';

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ANIMATION_MS = REDUCED_MOTION ? 1 : 300;

function parseUrl(url) {
  const clean = String(url || '').replace(/^#/, '');
  const [path, search] = clean.split('?');
  const query = {};
  new URLSearchParams(search || '').forEach((value, key) => {
    query[key] = value;
  });
  return { route: (path.replace(/^\//, '') || 'home'), query, url: clean || '/home' };
}

export class Router {
  /**
   * @param {object} routes route 名称 → View 子类
   * @param {HTMLElement} container 页面挂载容器
   * @param {(meta: object, depth: number) => void} onChange 导航栏同步回调
   */
  constructor({ routes, container, onChange }) {
    this.routes = routes;
    this.container = container;
    this.onChange = onChange;
    this.stack = [];
    this.index = 0;
    this.animating = false;

    window.addEventListener('popstate', (event) => this.onPopState(event));
  }

  get current() {
    return this.stack[this.stack.length - 1] || null;
  }

  start(initialQuery = {}) {
    const target = parseUrl(location.hash || '/home');
    history.replaceState({ index: 0 }, '', `#${target.url}`);
    this.mount(target.route, { ...initialQuery, ...target.query }, { animate: false });
  }

  /** 对应 wx.navigateTo */
  navigateTo(url) {
    const target = parseUrl(url);
    if (!this.routes[target.route] || this.animating) return;
    this.index += 1;
    history.pushState({ index: this.index }, '', `#${target.url}`);
    this.mount(target.route, target.query, { animate: true });
  }

  /** 对应 wx.redirectTo */
  redirectTo(url) {
    const target = parseUrl(url);
    if (!this.routes[target.route] || this.animating) return;
    history.replaceState({ index: this.index }, '', `#${target.url}`);
    const previous = this.stack.pop();
    this.destroy(previous);
    this.mount(target.route, target.query, { animate: false });
  }

  /**
   * 对应 wx.reLaunch：清空整个页面栈再打开目标页。
   * 登录完成后用它，避免登录前那张首页留在栈里（返回会看到旧状态、历史里也多一层）。
   */
  reLaunch(url) {
    const target = parseUrl(url);
    if (!this.routes[target.route] || this.animating) return;
    this.index = 0;
    history.replaceState({ index: 0 }, '', `#${target.url}`);
    this.stack.splice(0).forEach((entry) => this.destroy(entry));
    this.mount(target.route, target.query, { animate: false });
  }

  /** 对应 wx.navigateBack */
  navigateBack() {
    if (this.stack.length <= 1) return;
    history.back();
  }

  onPopState(event) {
    const target = parseUrl(location.hash || '/home');
    const nextIndex = (event.state && event.state.index) || 0;
    const below = this.stack[this.stack.length - 2];
    // 只有确实回到了栈里的上一页才出栈；直接改哈希（手动输入、外部链接）时重建页面
    if (nextIndex < this.index && below && below.route === target.route) {
      this.pop();
    } else {
      this.stack.splice(0).forEach((entry) => this.destroy(entry));
      this.mount(target.route, target.query, { animate: false });
    }
    this.index = nextIndex;
  }

  mount(route, query, { animate }) {
    let PageView = this.routes[route] || this.routes.home;
    // 登录守卫：参会登记、抽奖码、桌位图等必须先登录
    const required = PageView.auth;
    if (required) {
      const state = authState();
      const allowed = state === 'full' || (required === 'any' && state === 'pass');
      if (!allowed) {
        const back = `${route}${Object.keys(query || {}).length
          ? `?${new URLSearchParams(query)}`
          : ''}`;
        PageView = this.routes.login;
        route = 'login';
        query = { redirect: encodeURIComponent(`/${back}`) };
        history.replaceState({ index: this.index }, '', '#/login');
      }
    }
    const view = new PageView({ route, query, router: this });
    const previous = this.current;

    this.stack.push(view);
    this.container.appendChild(view.el);
    view.mount();
    view.onLoad(query);
    view.onShow();
    this.sync();

    if (animate && previous) {
      this.animating = true;
      view.el.classList.add('is-entering');
      previous.el.classList.add('is-behind');
      previous.onHide();
      setTimeout(() => {
        view.el.classList.remove('is-entering');
        previous.el.classList.add('is-hidden');
        this.animating = false;
      }, ANIMATION_MS);
    } else if (previous) {
      previous.el.classList.add('is-hidden');
      previous.onHide();
    }
  }

  pop() {
    const leaving = this.stack.pop();
    const target = this.current;
    if (!target) return;

    target.el.classList.remove('is-hidden', 'is-behind');
    target.onShow();
    this.sync();

    this.animating = true;
    leaving.el.classList.add('is-leaving');
    setTimeout(() => {
      this.destroy(leaving);
      this.animating = false;
    }, ANIMATION_MS);
  }

  destroy(entry) {
    if (!entry) return;
    entry.onUnload();
    entry.el.remove();
  }

  sync() {
    const view = this.current;
    if (!view) return;
    this.onChange(view.navMeta(), this.stack.length);
  }
}
