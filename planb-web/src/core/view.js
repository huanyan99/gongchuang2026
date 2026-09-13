/**
 * 页面基类：对齐小程序 Page 的生命周期与 setData 语义。
 *
 * - template() 返回整页标记，setData() 后整页重绘
 * - 重绘会保留滚动位置与输入焦点，因此表单页可以放心调用
 * - 事件用 data-tap / data-input / data-change / data-submit 委托绑定，
 *   与 wxml 的 bindtap / bindinput 一一对应，且不会因为重绘丢失监听
 */

import { html } from './dom.js';

export class View {
  /** 导航栏配置，对应页面 json 里的 navigationBar* */
  static meta = {
    title: '共创会',
    background: '#ffffff',
    textStyle: 'black',
  };

  constructor({ route, query, router }) {
    this.route = route;
    this.query = query || {};
    this.router = router;
    this.data = {};
    this.timers = new Set();

    this.el = document.createElement('section');
    this.el.className = `view view--${route}`;
    this.el.addEventListener('click', (event) => this.dispatch(event, 'tap'));
    this.el.addEventListener('input', (event) => this.dispatch(event, 'input'));
    this.el.addEventListener('change', (event) => this.dispatch(event, 'change'));
    this.el.addEventListener('submit', (event) => this.dispatch(event, 'submit'));
    this.el.addEventListener('focusin', (event) => this.keepVisible(event.target));
  }

  /* ---------- 生命周期 ---------- */

  onLoad() {}

  onShow() {}

  onHide() {}

  onUnload() {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
  }

  template() {
    return html``;
  }

  /* ---------- 渲染 ---------- */

  mount() {
    this.el.innerHTML = String(this.template());
    this.afterRender();
  }

  /** 合并状态并重绘，对应 this.setData */
  setData(patch) {
    Object.assign(this.data, patch);
    this.render();
  }

  /** 只更新状态不重绘，用于输入框等已经由 DOM 承载当前值的场景 */
  assign(patch) {
    Object.assign(this.data, patch);
  }

  render() {
    if (!this.el.isConnected) {
      this.el.innerHTML = String(this.template());
      return;
    }

    const scroller = this.el.querySelector('.page-scroll');
    const scrollTop = scroller ? scroller.scrollTop : 0;
    const active = document.activeElement;
    const focusName = active && this.el.contains(active) ? active.getAttribute('name') : '';
    const selection = focusName && active.selectionStart != null
      ? [active.selectionStart, active.selectionEnd]
      : null;

    this.el.innerHTML = String(this.template());

    const nextScroller = this.el.querySelector('.page-scroll');
    if (nextScroller && scrollTop) nextScroller.scrollTop = scrollTop;

    if (focusName) {
      const next = this.el.querySelector(`[name="${CSS.escape(focusName)}"]`);
      if (next) {
        next.focus({ preventScroll: true });
        if (selection && next.setSelectionRange) {
          try {
            next.setSelectionRange(selection[0], selection[1]);
          } catch (err) {
            /* number 类型输入不支持选区，忽略 */
          }
        }
      }
    }

    this.afterRender();
  }

  /** 每次渲染后的补充处理（自增高文本域、动画节点等） */
  afterRender() {}

  /** 导航栏配置，默认取页面静态 meta；页面可按状态覆盖后调用 router.sync() */
  navMeta() {
    return this.constructor.meta;
  }

  /* ---------- 工具 ---------- */

  $(selector) {
    return this.el.querySelector(selector);
  }

  $$(selector) {
    return Array.from(this.el.querySelectorAll(selector));
  }

  /** 受页面卸载管理的定时器 */
  later(callback, delay) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      callback();
    }, delay);
    this.timers.add(timer);
    return timer;
  }

  dispatch(event, type) {
    const target = event.target.closest(`[data-${type}]`);
    if (!target || !this.el.contains(target)) return;
    const handler = this[target.dataset[type]];
    if (typeof handler !== 'function') return;
    if (type === 'submit') event.preventDefault();
    handler.call(this, event, target.dataset, target);
  }

  /** 移动端键盘弹出时，保证聚焦控件仍在可视区域内 */
  keepVisible(target) {
    if (!target.matches('input, textarea')) return;
    this.later(() => {
      if (target.isConnected) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 280);
  }
}
