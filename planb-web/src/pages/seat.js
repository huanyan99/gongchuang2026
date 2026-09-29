/** 桌位图，对应 wechat-app/miniprogram/pages/seat/index.js */

import { View } from '../core/view.js';
import { html } from '../core/dom.js';
import { request, ensureLogin } from '../core/api.js';
import { showModal } from '../core/ui.js';

export class SeatView extends View {
  /** 需要登录：full=正常登录，any=正常登录或现场通道 */
  static auth = 'any';

  static meta = { title: '桌位图', background: '#0d214d', textStyle: 'white' };

  constructor(options) {
    super(options);
    this.data = {
      loading: true,
      eventCity: '',
      /** 该场次是否对嘉宾开放，由后端场次开关决定 */
      visible: true,
      published: false,
      mySeats: [],
    };
  }

  onLoad(options) {
    const eventCity = decodeURIComponent(options.city || '');
    this.setData({ eventCity });
    this.checkVisible(eventCity);
  }

  /**
   * 先问后端这个场次是否开放（公开接口，不需要登录，也不泄露任何嘉宾数据）。
   * 未开放就停在「暂未更新~」，与开关上线前的表现完全一致；
   * 查询失败时退回原逻辑，避免网络抖动把正常场次也挡掉。
   */
  checkVisible(eventCity) {
    if (!eventCity) return this.loadSeat();
    return request(`/api/seat/visibility?city=${encodeURIComponent(eventCity)}`, 'GET', {}, {}, { silent: true })
      .then((data) => {
        if (data && data.visible) return this.loadSeat();
        this.setData({ loading: false, visible: false });
        return undefined;
      })
      .catch(() => this.loadSeat());
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
        }).then(() => this.router.backOrHome());
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
      visible: data.visible !== false,
      published: !!data.published,
      mySeats,
    });
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
    if (!this.data.visible) return html`<div class="page-scroll"><div class="page"><div class="head"><img class="head-bg" src="assets/banner.jpg" alt="" /><div class="head-shade"></div><div class="head-copy"><div class="eyebrow">SEATING MAP</div><div class="title">桌位图</div><div class="gold-line"></div><div class="sub">${this.data.eventCity}场</div></div></div><div class="state-card">暂未更新~</div></div></div>`;
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
            `}
        </div>
      </div>
    `;
  }
}
