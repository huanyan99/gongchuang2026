/** 桌位图，对应 wechat-app/miniprogram/pages/seat/index.js */

import { View } from '../core/view.js';
import { html } from '../core/dom.js';
import { request, ensureLogin, config } from '../core/api.js';
import { showImage, showModal } from '../core/ui.js';

/** 全场位置图：把图片放进 assets/ 后在 config.js 的 hallImages 中填写路径 */
function hallImage(eventCity) {
  return (config.hallImages && config.hallImages[eventCity]) || '';
}

export class SeatView extends View {
  /** 需要登录：full=正常登录，any=正常登录或现场通道 */
  static auth = 'any';

  static meta = { title: '桌位图', background: '#0d214d', textStyle: 'white' };

  constructor(options) {
    super(options);
    this.data = {
      loading: true,
      eventCity: '',
      published: false,
      mySeats: [],
      hallImage: '',
    };
  }

  onLoad(options) {
    const eventCity = decodeURIComponent(options.city || '');
    this.setData({ eventCity, hallImage: hallImage(eventCity) });
    if (eventCity === '上海') { this.setData({ loading: false }); return; }
    this.loadSeat();
  }

  loadSeat() {
    return ensureLogin()
      .then(() => request('/api/seat/me', 'GET', {}, {}, { silent: true }))
      .then((data) => this.applySeat(data))
      .catch((err) => {
        this.setData({ loading: false });
        showModal({
          title: '暂不可查看',
          content: (err && err.message) || '桌位信息加载失败，请稍后重试',
          showCancel: false,
        }).then(() => this.router.navigateBack());
      });
  }

  applySeat(data) {
    const mySeats = (data.mySeats || []).map((item) => ({
      ...item,
      tableNo: String(item.tableNo),
    }));
    const eventCity = data.eventCity || this.data.eventCity;

    this.setData({
      loading: false,
      eventCity,
      published: !!data.published,
      mySeats,
      hallImage: hallImage(eventCity),
    });
  }

  previewHall() {
    if (this.data.hallImage) showImage(this.data.hallImage);
  }

  seatCards() {
    return this.data.mySeats.map((item) => html`
      <div class="seat-card">
        <span class="seat-name">${item.name}</span>
        <div class="seat-no-row">
          <span class="seat-no">${item.tableNo}</span>
          <span class="seat-unit">桌</span>
        </div>
      </div>
    `);
  }

  template() {
    if (this.data.eventCity === '上海') return html`<div class="page-scroll"><div class="page"><div class="head"><img class="head-bg" src="assets/banner.jpg" alt="" /><div class="head-shade"></div><div class="head-copy"><div class="eyebrow">SEATING MAP</div><div class="title">桌位图</div><div class="gold-line"></div><div class="sub">上海场</div></div></div><div class="state-card">暂未更新~</div></div></div>`;
    return html`
      <div class="page-scroll">
        <div class="page">
          <div class="head">
            <img class="head-bg" src="assets/banner.jpg" alt="" />
            <div class="head-shade"></div>
            <div class="head-copy">
              <div class="eyebrow">SEATING MAP</div>
              <div class="title">桌位图</div>
              <div class="gold-line"></div>
              <div class="sub">${this.data.eventCity}场</div>
            </div>
          </div>

          ${this.data.loading
            ? html`<div class="state-card">正在加载 ···</div>`
            : html`
              ${this.data.mySeats.length
                ? this.seatCards()
                : html`<div class="state-card">${this.data.published
                    ? '未查询到您的桌号，请联系现场会务人员'
                    : '桌位安排尚未发布'}</div>`}

              ${this.data.hallImage
                ? html`<img class="hall-image tap" src="${this.data.hallImage}" alt="全场位置图" data-tap="previewHall" />`
                : html`<div class="hall-placeholder">全场位置图待发布</div>`}
            `}
        </div>
      </div>
    `;
  }
}
