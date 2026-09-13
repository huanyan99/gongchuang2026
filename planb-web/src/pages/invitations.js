/**
 * 我的邀请，对应 wechat-app/miniprogram/pages/invitations/index.js。
 * 小程序的 open-type="share" 在浏览器用 Web Share API，不可用时退化为复制邀请链接。
 */

import { View } from '../core/view.js';
import { html } from '../core/dom.js';
import { request, ensureLogin } from '../core/api.js';
import { copyText, showImage, showModal, toast } from '../core/ui.js';

const CITIES = ['上海', '济南', '佛山'];

function inviteUrl(code) {
  const base = `${location.origin}${location.pathname}`;
  return `${base}?code=${encodeURIComponent(code)}`;
}

export class InvitationsView extends View {
  static auth = 'full';

  static meta = { title: '我的邀请', background: '#0d214d', textStyle: 'white' };

  constructor(options) {
    super(options);
    this.data = { invitations: CITIES.map((eventCity) => ({ eventCity, loading: true })) };
  }

  onShow() {
    this.refresh();
  }

  refresh() {
    return ensureLogin()
      .then(() => this.ensureCityInvitations())
      .then((invitations) => {
        const cards = CITIES.map((city) => (invitations || []).find((item) => item.eventCity === city)
          || { eventCity: city, loading: true });
        this.setData({ invitations: cards });
      })
      .catch((err) => {
        if (err && err.code === 1001) this.router.navigateBack();
      });
  }

  ensureCityInvitations() {
    return request('/api/invitations/mine', 'GET', {}, {}, { silent: true }).then((rows) => {
      const existing = rows || [];
      const missing = CITIES.filter((city) => !existing.some((item) => item.eventCity === city));
      if (!missing.length) return existing;
      return Promise.all(missing.map((eventCity) => request('/api/invitations', 'POST', { eventCity, maxUses: 100 }, {}, { silent: true })))
        .then(() => request('/api/invitations/mine', 'GET', {}, {}, { silent: true }));
    });
  }

  async shareInvite(event, dataset) {
    const code = dataset.code;
    if (!code) return;
    const url = inviteUrl(code);
    const payload = { title: '诚邀您参加柏楚2026价值共创峰会', text: '诚邀您参加柏楚2026价值共创峰会', url };

    if (navigator.share && navigator.canShare && navigator.canShare(payload)) {
      try {
        await navigator.share(payload);
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    const copied = await copyText(url);
    toast(copied ? '邀请链接已复制，可直接转发' : url);
  }

  showMiniCode(event, dataset) {
    const code = dataset.code;
    if (!code) return;
    request(`/api/invitations/${code}/mini-code`, 'GET', {}, {}, { silent: true })
      .then((data) => {
        if (!data || !data.imageBase64) throw new Error('empty');
        showImage(`data:image/png;base64,${data.imageBase64}`);
      })
      .catch(() => showModal({
        title: '小程序码待启用',
        content: '正式发布并配置微信 AppSecret 后即可生成。网页版可先使用“转发邀请”复制链接。',
        showCancel: false,
      }));
  }

  openList(event, dataset) {
    this.router.navigateTo(`/invitation-list?city=${encodeURIComponent(dataset.city)}`);
  }

  template() {
    return html`
      <div class="page-scroll">
        <div class="page">
          <div class="hero">
            <span class="eyebrow">INVITATION MANAGEMENT</span>
            <span class="title">我的邀请</span>
            <span class="hero-sub">选择场次，转发专属邀请并管理登记名单</span>
          </div>

          <div class="section-title">活动场次</div>

          ${this.data.invitations.map((item) => html`
            <div class="card invite-item">
              <div class="item-head"><span>${item.eventCity}场</span><span>多人邀请</span></div>
              <span class="company">已登记 ${item.usedCount || 0} 人</span>
              <div class="actions share-actions">
                <button type="button" ${item.code ? '' : 'disabled'} data-code="${item.code || ''}" data-tap="shareInvite">转发邀请</button>
                <button type="button" ${item.code ? '' : 'disabled'} data-code="${item.code || ''}" data-tap="showMiniCode">小程序码</button>
              </div>
              <button type="button" class="list-button" data-city="${item.eventCity}" data-tap="openList">查看邀请列表 <span>›</span></button>
            </div>
          `)}
        </div>
      </div>
    `;
  }
}
