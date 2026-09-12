/** Toast / Modal / 底部选择器，对齐 wx.showToast、wx.showModal、picker 的交互。 */

import { html, when, cx } from './dom.js';

function layer() {
  return document.getElementById('stageLayer');
}

function mount(markup) {
  const holder = document.createElement('div');
  holder.innerHTML = String(markup);
  const node = holder.firstElementChild;
  layer().appendChild(node);
  return node;
}

function dismiss(node, delay = 200) {
  if (!node || !node.isConnected) return;
  node.classList.add('is-leaving');
  setTimeout(() => node.remove(), delay);
}

let toastTimer = null;

/**
 * @param {string} title 文案
 * @param {'none'|'success'} icon 图标
 */
export function toast(title, icon = 'none', duration = 1800) {
  const previous = layer().querySelector('.toast');
  if (previous) previous.remove();
  clearTimeout(toastTimer);

  const node = mount(html`
    <div class="toast ${cx({ 'with-icon': icon === 'success' })}">
      ${when(icon === 'success', html`<div class="toast-icon"></div>`)}
      <div class="toast-text">${title}</div>
    </div>
  `);

  toastTimer = setTimeout(() => dismiss(node, 220), duration);
}

/**
 * @returns {Promise<{confirm: boolean, cancel: boolean, content: string}>}
 */
export function showModal(options = {}) {
  const {
    title = '',
    content = '',
    showCancel = true,
    cancelText = '取消',
    confirmText = '确定',
    editable = false,
    placeholderText = '',
  } = options;

  return new Promise((resolve) => {
    const node = mount(html`
      <div class="modal-mask">
        <div class="modal" role="dialog" aria-modal="true">
          ${when(title, html`<div class="modal-title">${title}</div>`)}
          ${when(content, html`<div class="modal-content">${content}</div>`)}
          ${when(editable, html`
            <div class="modal-input">
              <input type="text" data-role="editable" placeholder="${placeholderText}" />
            </div>
          `)}
          <div class="modal-actions">
            ${when(showCancel, html`<button type="button" class="cancel">${cancelText}</button>`)}
            <button type="button" class="confirm">${confirmText}</button>
          </div>
        </div>
      </div>
    `);

    const input = node.querySelector('[data-role="editable"]');
    if (input) setTimeout(() => input.focus(), 60);

    const finish = (confirm) => {
      document.removeEventListener('keydown', onKeydown);
      dismiss(node, 180);
      resolve({ confirm, cancel: !confirm, content: input ? input.value.trim() : '' });
    };

    function onKeydown(event) {
      if (event.key === 'Escape') finish(!showCancel);
      if (event.key === 'Enter' && !editable) finish(true);
    }

    node.querySelector('.confirm').addEventListener('click', () => finish(true));
    const cancelButton = node.querySelector('.cancel');
    if (cancelButton) cancelButton.addEventListener('click', () => finish(false));
    document.addEventListener('keydown', onKeydown);
  });
}

/**
 * 底部选择器，替代小程序 picker。
 * @returns {Promise<number|null>} 选中项下标，取消时为 null
 */
export function showSheet({ title = '', options = [], currentIndex = -1 } = {}) {
  return new Promise((resolve) => {
    const node = mount(html`
      <div class="sheet-mask">
        <div class="sheet" role="dialog" aria-modal="true">
          ${when(title, html`<div class="sheet-title">${title}</div>`)}
          <div class="sheet-options">
            ${options.map((option, index) => html`
              <div class="sheet-option ${cx({ 'is-active': index === currentIndex })}" data-index="${index}">${option}</div>
            `)}
          </div>
          <button type="button" class="sheet-cancel">取消</button>
        </div>
      </div>
    `);

    const finish = (value) => {
      document.removeEventListener('keydown', onKeydown);
      dismiss(node, 200);
      resolve(value);
    };

    function onKeydown(event) {
      if (event.key === 'Escape') finish(null);
    }

    node.addEventListener('click', (event) => {
      const option = event.target.closest('.sheet-option');
      if (option) {
        finish(Number(option.dataset.index));
        return;
      }
      if (event.target.closest('.sheet-cancel') || event.target === node) finish(null);
    });
    document.addEventListener('keydown', onKeydown);
  });
}

/** 复制文本，对应 wx.setClipboardData */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    /* 继续走兜底方案 */
  }

  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', 'readonly');
  area.style.cssText = 'position:fixed;top:-1000px;opacity:0';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch (err) {
    ok = false;
  }
  area.remove();
  return ok;
}

/** 轻震动，对应 wx.vibrateShort */
export function vibrate(duration = 15) {
  if (navigator.vibrate) navigator.vibrate(duration);
}

/** 图片预览，对应 wx.previewImage */
export function showImage(src) {
  const node = mount(html`
    <div class="image-mask"><img src="${src}" alt="" /></div>
  `);
  node.addEventListener('click', () => dismiss(node, 180));
}
