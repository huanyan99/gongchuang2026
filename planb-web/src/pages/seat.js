/** 桌位图，对应 wechat-app/miniprogram/pages/seat/index.js */

import { View } from '../core/view.js';
import { html, when, cx } from '../core/dom.js';
import { request, ensureLogin } from '../core/api.js';
import { showModal } from '../core/ui.js';

function seatLabel(seatNo) {
  return seatNo ? ` · ${seatNo} 号座` : '';
}

export class SeatView extends View {
  static meta = { title: '桌位图', background: '#0d214d', textStyle: 'white' };

  constructor(options) {
    super(options);
    this.data = {
      loading: true,
      eventCity: '',
      published: false,
      tables: [],
      mySeats: [],
      primarySeat: null,
      myTableCount: 0,
      selected: null,
    };
  }

  onLoad(options) {
    this.setData({ eventCity: decodeURIComponent(options.city || '') });
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
    const tables = (data.tables || []).map((item) => ({ ...item, tableNo: String(item.tableNo) }));
    const mySeats = (data.mySeats || []).map((item) => ({
      ...item,
      tableNo: String(item.tableNo),
      seatLabel: seatLabel(item.seatNo),
    }));
    const primarySeat = mySeats.length ? mySeats[0] : null;
    const myTable = primarySeat ? tables.find((item) => item.tableNo === primarySeat.tableNo) : null;

    this.setData({
      loading: false,
      eventCity: data.eventCity || this.data.eventCity,
      published: !!data.published,
      tables,
      mySeats,
      primarySeat,
      myTableCount: myTable ? myTable.guestCount : 0,
    });
  }

  selectTable(event, dataset) {
    this.setData({ selected: this.data.tables[Number(dataset.index)] });
  }

  closeDetail() {
    this.setData({ selected: null });
  }

  seatCard() {
    const seat = this.data.primarySeat;
    return html`
      <div class="seat-card">
        <div class="seat-eyebrow">MY TABLE</div>
        <div class="seat-no-row">
          <span class="seat-no">${seat.tableNo}</span>
          <span class="seat-unit">桌</span>
        </div>
        <div class="seat-name">${seat.name}${seat.seatLabel}</div>
        <div class="seat-meta">同桌 ${this.data.myTableCount} 人 · 请按桌号就座</div>
        ${when(this.data.mySeats.length > 1, () => html`
          <div class="seat-party">
            ${this.data.mySeats.map((item) => html`
              <div class="party-row">
                <span>${item.name}</span>
                <span>${item.tableNo} 桌${item.seatLabel}</span>
              </div>
            `)}
          </div>
        `)}
      </div>
    `;
  }

  hall() {
    return html`
      <div class="hall">
        <div class="hall-head">
          <span>全场桌位图</span>
          <span>共 ${this.data.tables.length} 桌</span>
        </div>
        <div class="hall-stage">舞　台</div>
        <div class="tables">
          ${this.data.tables.map((item, index) => html`
            <div class="table tap ${cx({ mine: item.mine })}" data-index="${index}" data-tap="selectTable">
              <div class="table-round">
                <span class="table-no">${item.tableNo}</span>
                <span class="table-count">${item.guestCount}人</span>
              </div>
            </div>
          `)}
        </div>
        <div class="legend">
          <div class="legend-item"><div class="dot mine"></div><span>我的桌位</span></div>
          <div class="legend-item"><div class="dot"></div><span>其他桌位</span></div>
        </div>
      </div>
    `;
  }

  detail() {
    const table = this.data.selected;
    return html`
      <div class="detail-mask" data-tap="closeDetail">
        <div class="detail-card">
          <div class="detail-head">
            <div class="detail-no">${table.tableNo} 桌</div>
            ${when(table.mine, html`<div class="detail-tag">我的桌位</div>`)}
          </div>
          <div class="detail-line">本桌就座 ${table.guestCount} 人</div>
          ${table.mine ? html`
            <div class="detail-guests">
              ${this.data.mySeats.filter((item) => item.tableNo === table.tableNo).map((item) => html`
                <div class="detail-guest">
                  <span>${item.name}</span>
                  <span>${item.seatNo ? `${item.seatNo} 号座` : '不指定座位'}</span>
                </div>
              `)}
            </div>
          ` : html`
            <div class="detail-note">为保护嘉宾个人信息，仅显示本桌就座人数。</div>
          `}
          <button type="button" class="detail-close" data-tap="closeDetail">知道了</button>
        </div>
      </div>
    `;
  }

  template() {
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
              <div class="sub">${this.data.eventCity}场 · 现场桌位安排</div>
            </div>
          </div>

          ${this.data.loading
            ? html`<div class="state-card">正在加载桌位安排 ···</div>`
            : html`
              ${this.data.primarySeat
                ? this.seatCard()
                : html`<div class="state-card">${this.data.published
                    ? '桌位安排已发布，但未查询到您的桌号，请联系现场会务人员。'
                    : '桌位安排尚未发布，请在活动当天留意会务通知。'}</div>`}
              ${when(this.data.tables.length, () => this.hall())}
            `}
        </div>
      </div>

      ${when(this.data.selected, () => this.detail())}
    `;
  }
}
