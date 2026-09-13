/**
 * 审核后台，对应 wechat-app/miniprogram/pages/admin/index.js。
 * 浏览器没有 wx.scanCode：入场核验改为手工录入凭证，其余接口与参数保持一致。
 */

import { View } from '../core/view.js';
import { html, when, cx } from '../core/dom.js';
import { request } from '../core/api.js';
import { getStorage, setStorage } from '../core/storage.js';
import { showModal, showSheet, toast } from '../core/ui.js';

const STATUS_TEXT = { PENDING: '待审核', APPROVED: '已通过', REJECTED: '已驳回' };
const PAGE_SIZE = 20;
const LOWER_THRESHOLD = 80;
const CITY_OPTIONS = ['上海', '济南', '佛山'];
const MODE_OPTIONS = ['合并更新', '覆盖该场次'];
const PHONE = /^1\d{10}$/;
const SEAT_HINT = '支持从 Excel 复制粘贴或选择 CSV 文件，每行：姓名,手机号,桌号';

/**
 * 解析批量导入文本：每行「姓名,手机号,桌号」，多余的列忽略。
 * 行内出现逗号/分号/制表符时按分隔符切分，否则按空白切分；首行表头自动跳过。
 * 与小程序 pages/admin/index.js 中的实现保持一致。
 */
function parseSeatRows(text) {
  const rows = [];
  const invalidLines = [];
  let firstContentLine = true;

  String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).forEach((line, index) => {
    const raw = line.trim();
    if (!raw) return;
    if (firstContentLine && raw.includes('姓名') && raw.includes('手机')) {
      firstContentLine = false;
      return;
    }
    firstContentLine = false;

    const parts = (/[,，;；\t]/.test(raw) ? raw.split(/[,，;；\t]+/) : raw.split(/\s+/))
      .map((item) => item.trim())
      .filter((item) => item !== '');
    if (parts.length < 3 || !PHONE.test(parts[1])) {
      invalidLines.push(index + 1);
      return;
    }
    rows.push({ name: parts[0], phone: parts[1], tableNo: parts[2] });
  });

  return { rows, invalidLines };
}

/** CSV 常见为 UTF-8，Excel 导出的中文 CSV 多为 GBK，这里按顺序尝试 */
function decodeText(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch (err) {
    try {
      return new TextDecoder('gbk').decode(buffer);
    } catch (fallbackError) {
      return new TextDecoder().decode(buffer);
    }
  }
}

export class AdminView extends View {
  static meta = { title: '审核后台', background: '#ffffff', textStyle: 'black' };

  constructor(options) {
    super(options);
    this.data = {
      adminKey: '',
      logged: false,
      statusFilter: '',
      list: [],
      total: 0,
      page: 1,
      hasMore: false,
      loading: false,
      cityIndex: 0,
      modeIndex: 0,
      seatText: '',
      seatRows: [],
      seatInvalidLines: [],
      seatImporting: false,
      seatSummary: '',
      guestDeviceLimit: false,
    };
  }

  onShow() {
    const saved = getStorage('adminKey');
    if (saved && !this.data.logged) {
      this.assign({ adminKey: saved });
      this.fetchList(true);
    }
  }

  afterRender() {
    const scroller = this.$('.page-scroll');
    if (scroller) scroller.addEventListener('scroll', () => this.onScroll(scroller), { passive: true });
  }

  onScroll(scroller) {
    const reachedBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= LOWER_THRESHOLD;
    if (reachedBottom && this.data.logged && this.data.hasMore && !this.data.loading) {
      this.fetchList(false);
    }
  }

  onInputKey(event) {
    this.assign({ adminKey: event.target.value });
  }

  login() {
    if (!String(this.data.adminKey || '').trim()) {
      toast('请输入管理密钥');
      return;
    }
    this.fetchList(true);
  }

  switchTab(event, dataset) {
    this.assign({ statusFilter: dataset.status || '' });
    this.fetchList(true);
  }

  fetchList(reset) {
    if (this.data.loading && !reset) return;
    const page = reset ? 1 : this.data.page + 1;
    this.assign({ loading: true });

    const status = this.data.statusFilter;
    const query = `?page=${page}&size=${PAGE_SIZE}${status ? `&status=${encodeURIComponent(status)}` : ''}`;

    return request(`/api/admin/applications${query}`, 'GET', {}, { 'X-Admin-Key': this.data.adminKey })
      .then((result) => {
        setStorage('adminKey', this.data.adminKey);
        const records = ((result && result.records) || []).map((item) => ({
          ...item,
          statusText: STATUS_TEXT[item.status] || item.status,
          checkedIn: !!item.checkedInAt,
        }));
        const list = reset ? records : this.data.list.concat(records);
        const total = Number((result && result.total) || 0);
        this.setData({ logged: true, list, total, page, hasMore: list.length < total });
        if (reset) {
          this.loadSeatSummary();
          this.loadSettings();
        }
      })
      .catch(() => {})
      .finally(() => this.setData({ loading: false }));
  }

  /* ---------- 安全设置 ---------- */

  loadSettings() {
    return request('/api/admin/settings', 'GET', {}, { 'X-Admin-Key': this.data.adminKey }, { silent: true })
      .then((result) => this.setData({ guestDeviceLimit: !!(result && result.device_binding_guests) }))
      .catch(() => {});
  }

  async toggleGuestDeviceLimit() {
    const enabled = !this.data.guestDeviceLimit;
    const confirmed = await showModal({
      title: enabled ? '开启设备限制' : '关闭设备限制',
      content: enabled
        ? '开启后，普通嘉宾也只能在首次登录的设备上登录。'
        : '关闭后，普通嘉宾可在任意设备登录；邀请人始终受限。',
    });
    if (!confirmed.confirm) return;
    return request(`/api/admin/settings/device_binding_guests?enabled=${enabled}`, 'POST', {}, { 'X-Admin-Key': this.data.adminKey })
      .then((result) => {
        this.setData({ guestDeviceLimit: !!(result && result.device_binding_guests) });
        toast(enabled ? '已开启' : '已关闭');
      })
      .catch(() => {});
  }

  /* ---------- 桌位批量导入 ---------- */

  async onSeatCityChange() {
    const picked = await showSheet({
      title: '活动场次',
      options: CITY_OPTIONS,
      currentIndex: this.data.cityIndex,
    });
    if (picked == null) return;
    this.setData({ cityIndex: picked });
    this.loadSeatSummary();
  }

  async onSeatModeChange() {
    const picked = await showSheet({
      title: '导入方式',
      options: MODE_OPTIONS,
      currentIndex: this.data.modeIndex,
    });
    if (picked == null) return;
    this.setData({ modeIndex: picked });
  }

  onSeatTextInput(event) {
    this.applySeatText(event.target.value, { keepFocus: true });
  }

  applySeatText(seatText, options = {}) {
    const parsed = parseSeatRows(seatText);
    if (options.keepFocus) {
      this.assign({ seatText, seatRows: parsed.rows, seatInvalidLines: parsed.invalidLines });
      this.renderSeatTip();
      return;
    }
    this.setData({ seatText, seatRows: parsed.rows, seatInvalidLines: parsed.invalidLines });
  }

  /** 输入时只更新提示文案，避免整页重绘打断输入 */
  renderSeatTip() {
    const tip = this.$('.seat-tip');
    if (tip) tip.textContent = this.seatTip();
    const preview = this.$('.seat-preview');
    if (preview) preview.outerHTML = String(this.seatPreview());
  }

  seatTip() {
    if (!this.data.seatText.trim()) return SEAT_HINT;
    const invalid = this.data.seatInvalidLines;
    return `已解析 ${this.data.seatRows.length} 位嘉宾${invalid.length
      ? `，第 ${invalid.slice(0, 5).join('、')} 行格式异常`
      : ''}`;
  }

  pickSeatFile() {
    const input = this.$('.seat-file');
    if (input) input.click();
  }

  onSeatFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    file.arrayBuffer()
      .then((buffer) => this.applySeatText(decodeText(buffer)))
      .catch(() => toast('文件读取失败'))
      .finally(() => { event.target.value = ''; });
  }

  async importSeats() {
    if (this.data.seatImporting) return;
    const rows = this.data.seatRows;
    if (!rows.length) {
      toast('请先粘贴或选择桌位数据');
      return;
    }
    const eventCity = CITY_OPTIONS[this.data.cityIndex];
    const mode = this.data.modeIndex === 1 ? 'REPLACE' : 'MERGE';
    const confirmed = await showModal({
      title: '确认导入桌位',
      content: mode === 'REPLACE'
        ? `将清空${eventCity}场原有桌位，并导入 ${rows.length} 位嘉宾的桌号。`
        : `将按手机号更新或新增 ${rows.length} 位嘉宾的桌号。`,
    });
    if (!confirmed.confirm) return;

    this.setData({ seatImporting: true });
    return request('/api/admin/seats/import', 'POST', { eventCity, mode, rows }, { 'X-Admin-Key': this.data.adminKey })
      .then((result) => {
        const errors = (result.errors || []).slice(0, 5).map((item) => `第${item.line}行：${item.message}`);
        showModal({
          title: '导入完成',
          content: `新增 ${result.created} 条，更新 ${result.updated} 条，失败 ${result.failed} 条。\n当前${eventCity}场共 ${result.tableCount} 桌 / ${result.guestCount} 人。${errors.length ? `\n${errors.join('\n')}` : ''}`,
          showCancel: false,
        });
        this.applySeatText('');
        this.loadSeatSummary();
      })
      .catch(() => {})
      .finally(() => this.setData({ seatImporting: false }));
  }

  loadSeatSummary() {
    const eventCity = CITY_OPTIONS[this.data.cityIndex];
    return request(`/api/admin/seats?city=${encodeURIComponent(eventCity)}&size=1`, 'GET', {}, { 'X-Admin-Key': this.data.adminKey }, { silent: true })
      .then((result) => this.setData({ seatSummary: `${eventCity}场 ${result.tableCount} 桌 / ${result.guestCount} 人` }))
      .catch(() => this.setData({ seatSummary: '' }));
  }

  async scanCheckin() {
    const result = await showModal({
      title: '入场核验',
      content: '网页版无法调用摄像头扫码，请录入嘉宾入场凭证或登记手机号。',
      editable: true,
      placeholderText: '入场凭证 / 手机号',
      confirmText: '核验',
    });
    if (!result.confirm) return;
    const token = result.content;
    if (!token) {
      toast('未识别到入场码');
      return;
    }
    this.doCheckin(token);
  }

  doCheckin(token) {
    if (this.checking) return;
    this.checking = true;
    return request('/api/admin/checkin', 'POST', { token }, { 'X-Admin-Key': this.data.adminKey })
      .then((guest) => {
        toast(`核验通过：${(guest && guest.name) || '嘉宾'}`);
        this.fetchList(true);
      })
      .catch(() => {})
      .finally(() => { this.checking = false; });
  }

  async review(event, dataset) {
    const { id, status } = dataset;
    if (status === 'REJECTED') {
      const result = await showModal({ title: '驳回', editable: true, placeholderText: '选填：驳回原因' });
      if (result.confirm) this.doReview(id, status, result.content);
      return;
    }
    const result = await showModal({ title: '确认通过', content: '确定通过该登记吗？' });
    if (result.confirm) this.doReview(id, status, '');
  }

  doReview(id, status, remark) {
    if (this.reviewing) return;
    this.reviewing = true;
    return request(`/api/admin/applications/${id}/review`, 'POST', { status, remark }, { 'X-Admin-Key': this.data.adminKey })
      .then(() => {
        toast('已处理', 'success');
        this.fetchList(true);
      })
      .catch(() => {})
      .finally(() => { this.reviewing = false; });
  }

  loginBox() {
    return html`
      <div class="login-box">
        <div class="eyebrow">ADMIN CONSOLE</div>
        <div class="page-title">审核后台</div>
        <input class="key-input" name="adminKey" type="password" placeholder="请输入管理密钥" value="${this.data.adminKey}" data-input="onInputKey" />
        <button type="button" class="btn" data-tap="login">进入审核后台</button>
      </div>
    `;
  }

  console() {
    return html`
      <div class="admin-head">
        <div>
          <div class="eyebrow">ADMIN CONSOLE</div>
          <div class="page-title">审核后台</div>
        </div>
        <div class="count">${this.data.total}</div>
      </div>

      <div class="checkin-bar">
        <button type="button" class="btn scan-btn" data-tap="scanCheckin">入场核验</button>
      </div>

      ${this.seatPanel()}
      ${this.securityPanel()}

      <div class="tabs">
        ${[['', '全部'], ['PENDING', '待审核'], ['APPROVED', '已通过'], ['REJECTED', '已驳回']].map(([status, label]) => html`
          <div class="tab tap ${cx({ active: this.data.statusFilter === status })}" data-status="${status}" data-tap="switchTab">${label}</div>
        `)}
      </div>

      ${when(!this.data.list.length, html`<div class="empty">暂无登记记录</div>`)}

      ${this.data.list.map((item) => html`
        <div class="card">
          <div class="row">
            <span class="name">${item.name}</span>
            <span class="status ${item.status}">${item.checkedIn ? '已入场' : item.statusText}</span>
          </div>
          <div class="info">${item.phone} / ${item.company || '未填写'} / ${item.position || '未填写'}</div>
          ${when(item.reason, html`<div class="reason">${item.reason}</div>`)}
          ${when(item.reviewRemark, html`<div class="remark">审核备注：${item.reviewRemark}</div>`)}
          ${when(item.status === 'PENDING', () => html`
            <div class="actions">
              <button type="button" class="mini-btn approve" data-id="${item.id}" data-status="APPROVED" data-tap="review">通过</button>
              <button type="button" class="mini-btn reject" data-id="${item.id}" data-status="REJECTED" data-tap="review">驳回</button>
            </div>
          `)}
        </div>
      `)}

      ${when(this.data.hasMore, html`<div class="more-hint">上拉加载更多</div>`)}
    `;
  }

  seatPreview() {
    const rows = this.data.seatRows.slice(0, 5);
    if (!rows.length) return html`<div class="seat-preview" hidden></div>`;
    return html`
      <div class="seat-preview">
        ${rows.map((row) => html`
          <div class="seat-preview-row">
            <span>${row.name}</span>
            <span>${row.phone}</span>
            <span>${row.tableNo} 桌</span>
          </div>
        `)}
        ${when(this.data.seatRows.length > rows.length, html`
          <div class="seat-preview-more">共 ${this.data.seatRows.length} 行，仅预览前 5 行</div>
        `)}
      </div>
    `;
  }

  securityPanel() {
    return html`
      <div class="seat-panel">
        <div class="seat-head">
          <span>安全设置</span>
          <span>邀请人始终限制</span>
        </div>
        <div class="seat-row">
          <span class="seat-label">普通嘉宾设备限制</span>
          <span class="seat-value tap" data-tap="toggleGuestDeviceLimit">${this.data.guestDeviceLimit ? '已开启' : '已关闭'} ›</span>
        </div>
      </div>
    `;
  }

  seatPanel() {
    return html`
      <div class="seat-panel">
        <div class="seat-head">
          <span>桌位批量导入</span>
          <span>${this.data.seatSummary}</span>
        </div>
        <div class="seat-row">
          <span class="seat-label">活动场次</span>
          <span class="seat-value tap" data-tap="onSeatCityChange">${CITY_OPTIONS[this.data.cityIndex]} ›</span>
        </div>
        <div class="seat-row">
          <span class="seat-label">导入方式</span>
          <span class="seat-value tap" data-tap="onSeatModeChange">${MODE_OPTIONS[this.data.modeIndex]} ›</span>
        </div>
        <div class="seat-actions">
          <button type="button" class="seat-file-btn" data-tap="pickSeatFile">选择 CSV / TXT 文件</button>
          <input class="seat-file" type="file" accept=".csv,.txt,text/csv,text/plain" data-change="onSeatFile" hidden />
        </div>
        <textarea
          class="seat-input"
          name="seatText"
          rows="6"
          placeholder="每行一位嘉宾：姓名,手机号,桌号"
          data-input="onSeatTextInput"
        >${this.data.seatText}</textarea>
        <div class="seat-tip">${this.seatTip()}</div>
        ${this.seatPreview()}
        <button type="button" class="btn seat-btn" ${this.data.seatImporting ? 'disabled' : ''} data-tap="importSeats">
          ${this.data.seatImporting ? '导入中 ···' : '导入桌位'}
        </button>
      </div>
    `;
  }

  template() {
    return html`
      <div class="page-scroll">
        <div class="container">
          ${this.data.logged ? this.console() : this.loginBox()}
        </div>
      </div>
    `;
  }
}
