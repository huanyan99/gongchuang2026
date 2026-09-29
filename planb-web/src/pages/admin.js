/**
 * 审核后台，对应 wechat-app/miniprogram/pages/admin/index.js。
 * 浏览器没有 wx.scanCode：入场核验改为手工录入凭证，其余接口与参数保持一致。
 */

import { View } from '../core/view.js';
import { SeatBoardModal } from './seat-board.js';
import { html, when, cx } from '../core/dom.js';
import { request, config } from '../core/api.js';
import { getStorage, setStorage, removeStorage } from '../core/storage.js';
import { copyText, showModal, showSheet, toast } from '../core/ui.js';

const STATUS_TEXT = { PENDING: '待审核', APPROVED: '已通过', REJECTED: '已驳回' };
const EXPORT_STATUS_OPTIONS = [['全部', '全部'], ['PENDING', '待审核'], ['APPROVED', '已通过'], ['REJECTED', '已驳回']];
const PAGE_SIZE = 20;
const LOWER_THRESHOLD = 80;
const CITY_OPTIONS = ['上海', '济南', '佛山'];

export class AdminView extends View {
  static meta = { title: '审核后台', background: '#ffffff', textStyle: 'black' };

  constructor(options) {
    super(options);
    /** 正在提交审核的登记 id：行级互斥，避免整页只有一个布尔导致"点了没反应" */
    this.pendingReviewIds = new Set();
    this.listRequestId = 0;
    this.data = {
      adminToken: '',
      pcSection: 'sec-review',
      exportCity: '全部',
      exportStatus: '全部',
      adminName: '',
      username: '',
      password: '',
      logging: false,
      logged: false,
      statusFilter: '',
      reviewCity: '全部',
      reviewName: '',
      list: [],
      total: 0,
      page: 1,
      hasMore: false,
      loading: false,
      cityIndex: 0,
      seatSummary: '',
      pendingReviewIds: [],
      guestDeviceLimit: false,
      lotterySettings: {},
      lotterySettingsReady: false,
      lotterySaving: false,
      inviterDeviceLimit: true,
      users: [],
      usersLoading: false,
      entryQr: null,
      entryTarget: 'home',
      attendanceCity: '全部',
      attendanceRows: [],
      attendanceUpdatedAt: '',
      attendanceLoading: false,
      passCityIndex: 0,
      passNote: '',
      passes: [],
      passCreating: false,
      lastPass: null,
    };
  }

  onShow() {
    const saved = getStorage('adminToken');
    if (saved && !this.data.logged) {
      this.assign({ adminToken: saved });
      request('/api/admin/session', 'GET', {}, { 'X-Admin-Token': saved }, { silent: true })
        .then((admin) => {
          this.setData({ adminName: (admin && admin.displayName) || '' });
          this.fetchList(true);
        })
        .catch(() => {
          removeStorage('adminToken');
          this.setData({ adminToken: '', logged: false });
        });
    }
  }

  adminHeader() {
    // setData 重绘或页面恢复期间 data 可能尚未同步，导出等原生 fetch 始终从持久会话兜底取 token。
    return { 'X-Admin-Token': this.data.adminToken || getStorage('adminToken') || '' };
  }

  /* ---------- 电脑版（宽屏）支持 ---------- */

  isPc() {
    return window.innerWidth >= 1024;
  }

  usePcUi() {
    return document.body.classList.contains('admin-pc-open');
  }

  /** 电脑模式下用轻量提示替代手机弹层 */
  notify(message, type) {
    if (!this.usePcUi()) return toast(message, type);
    const el = document.createElement('div');
    el.className = 'pc-toast';
    el.textContent = message;
    document.getElementById('adminPc').appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }

  confirmBox(title, content) {
    const sep = String.fromCharCode(10) + String.fromCharCode(10);
    if (this.usePcUi()) return Promise.resolve({ confirm: window.confirm(title + (content ? sep + content : '')) });
    return showModal({ title, content, showCancel: true });
  }

  promptBox(title, placeholderText) {
    if (this.usePcUi()) {
      const content = window.prompt(title + (placeholderText ? `（${placeholderText}）` : ''));
      return Promise.resolve({ confirm: content != null, content: content == null ? '' : content });
    }
    return showModal({ title, editable: true, placeholderText });
  }

  /** 电脑模式：后台渲染到独立的全屏层，脱离手机缩放画布 */
  mount() {
    if (this.isPc()) {
      this.el.classList.add('admin-pc-view');
      const root = document.getElementById('adminPc');
      root.hidden = false;
      document.body.classList.add('admin-pc-open');
      root.appendChild(this.el);
    }
    super.mount();
  }

  render() {
    if (!this.usePcUi()) { super.render(); return; }
    const y = window.scrollY;
    super.render();
    window.scrollTo(0, y);
  }

  onUnload() {
    document.body.classList.remove('admin-pc-open');
    const root = document.getElementById('adminPc');
    if (root) root.hidden = true;
    super.onUnload();
  }

  /**
   * 管理端请求统一出口：会话失效（1001）时直接退回登录框，
   * 避免各处 catch 吞掉错误后继续显示默认值（例如开关状态）。
   */
  adminRequest(path, method = 'GET', data = {}, options = {}) {
    return request(path, method, data, this.adminHeader(), options)
      .catch((err) => {
        if (err && err.code === 1001) this.expireSession();
        return Promise.reject(err);
      });
  }

  expireSession() {
    this.listRequestId += 1;
    if (!this.data.adminToken && !this.data.logged && !getStorage('adminToken')) return;
    removeStorage('adminToken');
    this.setData({ adminToken: '', adminName: '', logged: false, list: [], total: 0 });
    toast('登录已失效，请重新登录');
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

  onInputUsername(event) {
    this.assign({ username: event.target.value });
  }

  onInputPassword(event) {
    this.assign({ password: event.target.value });
  }

  login() {
    if (this.data.logging) return;
    const username = String(this.data.username || '').trim();
    const password = String(this.data.password || '');
    if (!username || !password) {
      this.notify('请输入账号和口令');
      return;
    }
    this.setData({ logging: true });
    return request('/api/admin/login', 'POST', { username, password }, {}, { skipRetry: true })
      .then((result) => {
        setStorage('adminToken', result.token);
        this.setData({ adminToken: result.token, adminName: result.displayName || username, password: '' });
        this.fetchList(true);
      })
      .catch(() => {})
      .finally(() => this.setData({ logging: false }));
  }

  logout() {
    this.listRequestId += 1;
    request('/api/admin/logout', 'POST', {}, this.adminHeader(), { silent: true }).catch(() => {});
    removeStorage('adminToken');
    this.setData({ adminToken: '', adminName: '', logged: false, list: [], total: 0 });
  }

  setExportCity(event, dataset) {
    this.setData({ exportCity: dataset.city || '全部' });
  }

  setExportStatus(event, dataset) {
    this.setData({ exportStatus: dataset.status || '全部' });
  }

  doExport() {
    if (this.data.exporting) return;
    const statusMap = { PENDING: '待审核', APPROVED: '已通过', REJECTED: '已驳回' };
    const city = this.data.exportCity;
    const status = this.data.exportStatus;
    const query = [];
    if (city && city !== '全部') query.push(`city=${encodeURIComponent(city)}`);
    if (status && status !== '全部') query.push(`status=${status}`);
    const qs = query.length ? `?${query.join('&')}` : '';
    this.setData({ exporting: true });
    fetch(`${config.apiBase}/api/admin/export.csv${qs}`, { headers: this.adminHeader() })
      .then(async (response) => {
        const type = response.headers.get('content-type') || '';
        if (!response.ok || !type.includes('text/csv')) {
          const error = await response.json().catch(() => ({}));
          if (response.status === 404 || error.code === 1002) return this.exportLegacyCsv(qs, city, status, statusMap);
          if (error.code === 1001) this.expireSession();
          throw new Error(error.message || '导出失败');
        }
        const blob = await response.blob();
        this.downloadCsv(blob, city, statusMap[status] || status);
        this.notify('导出完成', 'success');
      })
      .catch((error) => this.notify(error.message || '导出失败，请稍后重试'))
      .finally(() => this.setData({ exporting: false }));
  }

  /** 发布期间兼容尚未升级、没有 /export.csv 的旧后端。 */
  exportLegacyCsv(qs, city, status, statusMap) {
    return request(`/api/admin/export${qs}`, 'GET', {}, this.adminHeader(), { silent: true })
      .then((rows) => {
        if (!rows || !rows.length) {
          this.notify('该条件下暂无数据');
          return;
        }
        const header = Object.keys(rows[0]);
        const escapeCsv = (value) => {
          let text = String(value == null ? '' : value);
          if (/^[=+\-@]/.test(text)) text = "'" + text;
          return /[,"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        };
        const lines = ['\uFEFF' + header.join(',')].concat(rows.map((row) =>
          header.map((key) => escapeCsv(key === '审核状态' ? (statusMap[row[key]] || row[key]) : row[key])).join(',')));
        this.downloadCsv(new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }),
          city, statusMap[status] || status);
        this.notify(`已导出 ${rows.length} 条`, 'success');
      });
  }

  downloadCsv(blob, city, status) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `参会名单_${city}_${status}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  /** 导出抽奖码：抽奖码、姓名、公司、手机号，可按场次过滤 */
  exportCodes() {
    if (this.data.exporting) return;
    const city = this.data.exportCity;
    const qs = city && city !== '全部' ? `?city=${encodeURIComponent(city)}` : '';
    this.setData({ exporting: true });
    request(`/api/admin/lottery-export${qs}`, 'GET', {}, this.adminHeader())
      .then((rows) => {
        if (!rows || !rows.length) return this.notify('暂无抽奖码数据');
        const header = Object.keys(rows[0]);
        const NL = String.fromCharCode(10);
        const CR = String.fromCharCode(13);
        const badChars = [',', '"', NL, CR];
        const esc = (v) => {
          v = String(v == null ? '' : v);
          if (/^[=+\-@]/.test(v)) v = "'" + v;
          return badChars.some((ch) => v.includes(ch)) ? '"' + v.replace(/"/g, '""') + '"' : v;
        };
        const bom = String.fromCharCode(65279);
        const lines = [bom + header.join(',')].concat(
          rows.map((row) => header.map((h) => esc(row[h])).join(','))
        );
        const blob = new Blob([lines.join(NL + CR)], { type: 'text/csv;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `抽奖码_${city}_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        this.notify(`已导出 ${rows.length} 条`, 'success');
      })
      .catch(() => this.notify('导出失败，请检查后端服务后重试'))
      .finally(() => this.setData({ exporting: false }));
  }

  switchTab(event, dataset) {
    this.assign({ statusFilter: dataset.status || '' });
    this.fetchList(true);
  }

  setReviewCity(event, dataset) {
    this.assign({ reviewCity: dataset.city || '全部' });
    this.fetchList(true);
  }

  onReviewNameInput(event) {
    // 只记录输入，不自动搜索；由回车或「搜索」按钮触发 searchReview
    this.assign({ reviewName: event.target.value.slice(0, 64) });
  }

  searchReview(event) {
    if (this.data.loading) return; // 加载中不重复提交，避免连点卡住
    if (event && event.target) {
      const input = event.target.querySelector('input');
      if (input) this.assign({ reviewName: input.value.slice(0, 64) });
    }
    this.fetchList(true);
  }

  /** 按当前筛选条件（状态/区域/关键词）重新拉取列表 */
  refreshReview() {
    if (this.data.loading) return;
    this.fetchList(true);
  }

  clearReviewName() {
    this.assign({ reviewName: '' });
    this.searchReview();
  }

  fetchList(reset) {
    if (this.data.loading && !reset) return;
    const requestId = ++this.listRequestId;
    const page = reset ? 1 : this.data.page + 1;
    this.assign({ loading: true });

    const status = this.data.statusFilter;
    const city = this.data.reviewCity;
    const name = this.data.reviewName.trim();
    const query = `?page=${page}&size=${PAGE_SIZE}`
      + `${status ? `&status=${encodeURIComponent(status)}` : ''}`
      + `${city && city !== '全部' ? `&city=${encodeURIComponent(city)}` : ''}`
      + `${name ? `&name=${encodeURIComponent(name)}` : ''}`;

    return this.adminRequest(`/api/admin/applications${query}`)
      .then((result) => {
        if (requestId !== this.listRequestId) return;
        const records = ((result && result.records) || []).map((item) => ({
          ...item,
          statusText: STATUS_TEXT[item.status] || item.status,
          checkedIn: !!item.checkedInAt,
          matchedNames: name && Array.isArray(item.attendees)
            ? [...new Set(item.attendees.filter((guest) => guest.name && guest.name.includes(name) && guest.name !== item.name)
              .map((guest) => guest.name))].join('、') : '',
          dupNames: Array.isArray(item.duplicateNames) ? [...new Set(item.duplicateNames)].join('、') : '',
          reviewedByName: item.reviewedByName || '',
          reviewedAtText: item.reviewedAt ? String(item.reviewedAt).replace('T', ' ') : '',
        }));
        const list = reset ? records : this.data.list.concat(records);
        const total = Number((result && result.total) || 0);
        this.setData({ logged: true, list, total, page, hasMore: list.length < total });
        if (reset) {
          this.loadSeatSummary();
          this.loadSettings();
          this.loadPasses();
          this.loadUsers();
        }
      })
      .catch(() => {})
      .finally(() => {
        if (requestId === this.listRequestId) this.setData({ loading: false });
      });
  }

  /* ---------- 现场通道 ---------- */

  loadPasses() {
    return this.adminRequest('/api/admin/passes', 'GET', {}, { silent: true })
      .then((rows) => this.setData({ passes: rows || [] }))
      .catch(() => {});
  }

  async onPassCityChange() {
    const options = ['不限场次', ...CITY_OPTIONS];
    const picked = await showSheet({ title: '适用场次', options, currentIndex: this.data.passCityIndex });
    if (picked == null) return;
    this.setData({ passCityIndex: picked });
  }

  onPassNoteInput(event) {
    this.assign({ passNote: event.target.value });
  }

  createPass() {
    if (this.data.passCreating) return;
    const eventCity = this.data.passCityIndex === 0 ? '' : CITY_OPTIONS[this.data.passCityIndex - 1];
    this.setData({ passCreating: true });
    return this.adminRequest('/api/admin/passes', 'POST', { eventCity, note: this.data.passNote })
      .then((pass) => {
        this.setData({ lastPass: pass, passNote: '' });
        this.loadPasses();
      })
      .catch(() => {})
      .finally(() => this.setData({ passCreating: false }));
  }

  async copyPassUrl(event, dataset) {
    const copied = await copyText(dataset.url);
    toast(copied ? '链接已复制' : dataset.url);
  }

  async disablePass(event, dataset) {
    const confirmed = await this.confirmBox('停用该通道？', '停用后已扫码的会话立即失效。');
    if (!confirmed.confirm) return;
    return this.adminRequest(`/api/admin/passes/${dataset.id}/disable`, 'POST')
      .then(() => {
        this.notify('已停用');
        this.setData({ lastPass: null });
        this.loadPasses();
      })
      .catch(() => {});
  }

  /* ---------- 安全设置 ---------- */

  loadSettings() {
    return this.adminRequest('/api/admin/settings', 'GET', {}, { silent: true })
      .then((result) => this.setData({
        guestDeviceLimit: !!(result && result.device_binding_guests),
        lotterySettings: result || {},
        lotterySettingsReady: true,
        inviterDeviceLimit: !!(result && result.device_binding_inviters),
      }))
      .catch(() => {});
  }

  loadUsers() {
    this.assign({ usersLoading: true });
    return this.adminRequest('/api/admin/users', 'GET', {}, { silent: true })
      .then((users) => this.setData({ users: users || [] }))
      .catch(() => {})
      .finally(() => this.assign({ usersLoading: false }));
  }

  async toggleLottery(event, dataset) {
    if (this.data.lotterySaving || !this.data.lotterySettingsReady) return;
    const allowed = ['lottery_open_foshan', 'lottery_open_jinan', 'lottery_open_shanghai'];
    if (!allowed.includes(dataset.key)) return;
    const enabled = !this.data.lotterySettings[dataset.key];
    const result = await this.confirmBox(`${enabled ? '开启' : '关闭'}${dataset.city}场抽奖码领取`,
      enabled ? '开启后，已审核嘉宾可以领取本人的抽奖码。' : '关闭后，嘉宾领取时将提示“还没有到时间”。');
    if (!result.confirm) return;
    this.setData({ lotterySaving: true });
    return this.adminRequest(`/api/admin/settings/${dataset.key}?enabled=${enabled}`, 'POST')
      .then((settings) => { this.setData({ lotterySettings: settings }); toast('已保存'); })
      .catch(() => {})
      .finally(() => this.setData({ lotterySaving: false }));
  }

  lotterySettingsPanel() {
    return html`<div class="seat-panel">
      <div class="seat-head"><span>抽奖码领取开关</span><span>三场独立控制</span></div>
      ${[['佛山','lottery_open_foshan'],['济南','lottery_open_jinan'],['上海','lottery_open_shanghai']].map(([city,key]) => {
        const state = this.data.lotterySettings[key];
        return html`
        <div class="seat-row"><span class="seat-label">${city}场 · ${state ? '可领取' : '未开放'}</span>
          <span class="seat-state ${state ? 'on' : 'off'}">${state ? '已开启' : '已关闭'}</span>
          <div class="pc-switch tap ${cx({ on: !!state })}" data-key="${key}" data-city="${city}"
            data-tap="toggleLottery" ${!this.data.lotterySettingsReady || this.data.lotterySaving ? 'disabled' : ''}></div>
        </div>`})}
    </div>`;
  }

  async resetUserDevice(event, dataset) {
    const user = this.data.users.find((item) => String(item.id) === String(dataset.id));
    const name = (user && (user.name || user.phone)) || '该用户';
    const confirmed = await this.confirmBox('解绑登录设备',
      `确定允许“${name}”更换设备吗？解绑后当前登录会失效，下一次登录的设备将重新绑定。`);
    if (!confirmed.confirm) return;
    return this.adminRequest(`/api/admin/users/${dataset.id}/reset-device`, 'POST')
      .then(() => {
        this.notify('设备已解绑', 'success');
        this.loadUsers();
      })
      .catch(() => {});
  }

  showLoginAudits(event, dataset) {
    const typeText = {
      MINIPROGRAM: '小程序登录', OFFICIAL_ACCOUNT: '公众号登录',
      WECHAT_MESSAGE: '公众号消息登录', WEB_PHONE: '网页登录', ADMIN_RESET: '管理员解绑',
    };
    return this.adminRequest(`/api/admin/login-audits?userId=${dataset.id}&page=1&size=20`, 'GET')
      .then((result) => {
        const rows = (result && result.records) || [];
        const content = rows.length ? rows.map((row) => {
          const status = row.result === 'SUCCESS' ? '成功' : '设备冲突';
          const device = row.deviceHash ? ` · 设备 ${row.deviceHash}` : '';
          const actor = row.adminName ? ` · 操作人 ${row.adminName}` : '';
          return `${String(row.createdAt || '').replace('T', ' ')}\n${typeText[row.loginType] || row.loginType} · ${status}${device}${actor}${row.ipAddress ? ` · IP ${row.ipAddress}` : ''}`;
        }).join('\n\n') : '暂无登录或设备操作记录';
        if (this.usePcUi()) { window.alert(content || '暂无登录或设备操作记录'); return; }
        return showModal({ title: '登录与设备审计', content, showCancel: false, confirmText: '关闭' });
      })
      .catch(() => {});
  }

  /** 设备限制开关：后端每次登录实时读库，改完即刻生效 */
  async toggleDeviceLimit(event, dataset) {
    const inviter = dataset.role === 'inviter';
    const key = inviter ? 'device_binding_inviters' : 'device_binding_guests';
    const enabled = !(inviter ? this.data.inviterDeviceLimit : this.data.guestDeviceLimit);
    const who = inviter ? '邀请人' : '普通嘉宾';
    const confirmed = await showModal({
      title: enabled ? `开启${who}设备限制` : `关闭${who}设备限制`,
      content: enabled
        ? `开启后，${who}只能在首次登录的设备上登录。`
        : `关闭后，${who}可在任意设备登录。`,
    });
    if (!confirmed.confirm) return;
    return this.adminRequest(`/api/admin/settings/${key}?enabled=${enabled}`, 'POST')
      .then((result) => {
        this.setData({
          guestDeviceLimit: !!(result && result.device_binding_guests),
          inviterDeviceLimit: !!(result && result.device_binding_inviters),
        });
        this.notify(enabled ? '已开启' : '已关闭');
      })
      .catch(() => {});
  }

  /** 首页 / 抽奖码入口二维码：不含密钥，扫码后按正常登录流程走 */
  async showEntryQr(event, dataset) {
    const target = dataset.target;
    return this.adminRequest(`/api/admin/qrcode?target=${target}`)
      .then((result) => this.setData({ entryQr: result, entryTarget: target }))
      .catch(() => {});
  }

  /* ---------- 桌位分配 ---------- */

  onSeatCitySelect(event) {
    this.setData({ cityIndex: Math.max(0, CITY_OPTIONS.indexOf(event.target.value)) });
    this.loadSeatSummary();
  }


  onPassCitySelect(event) {
    this.setData({ passCityIndex: Math.max(0, CITY_OPTIONS.indexOf(event.target.value)) });
  }

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




  /** 输入时只更新提示文案，避免整页重绘打断输入 */





  /** 打开桌位分配看板：独立覆盖层，不参与本页重绘，保存后刷新统计 */
  openSeatBoard() {
    const eventCity = CITY_OPTIONS[this.data.cityIndex];
    const modal = new SeatBoardModal({
      adminRequest: (path, method, data, options) => this.adminRequest(path, method, data, options),
      city: eventCity,
      onSaved: () => this.loadSeatSummary(),
    });
    return modal.mount();
  }

  loadSeatSummary() {
    const eventCity = CITY_OPTIONS[this.data.cityIndex];
    return this.adminRequest(`/api/admin/seats/board?city=${encodeURIComponent(eventCity)}&summaryOnly=true`, 'GET', {}, { silent: true })
      .then((result) => {
        const summary = result.summary || {};
        this.setData({
          seatSummary: `${eventCity}场 ${summary.tableCount || 0} 桌 / ${summary.peopleCount || 0} 人 · 已分配 ${summary.assigned || 0}`,
        });
      })
      .catch(() => this.setData({ seatSummary: '' }));
  }

  async scanCheckin() {
    const result = await this.promptBox('入场核验', '入场凭证 / 手机号');
    if (!result.confirm) return;
    const token = result.content;
    if (!token) {
      this.notify('未识别到入场码');
      return;
    }
    this.doCheckin(token);
  }

  doCheckin(token) {
    if (this.checking) return;
    this.checking = true;
    return this.adminRequest('/api/admin/checkin', 'POST', { token })
      .then((guest) => {
        this.notify(`核验通过：${(guest && guest.name) || '嘉宾'}`);
        this.fetchList(true);
      })
      .catch(() => {})
      .finally(() => { this.checking = false; });
  }

  async review(event, dataset) {
    const { id, status } = dataset;
    if (status === 'REJECTED') {
      const result = await this.promptBox('驳回', '选填：驳回原因');
      if (result.confirm) this.doReview(id, status, result.content);
      return;
    }
    const result = await this.confirmBox('确认通过', '确定通过该登记吗？');
    if (result.confirm) this.doReview(id, status, '');
  }

  /** 该行是否正在处理中（多管理员同时操作时只锁住这一行） */
  isReviewPending(id) {
    return this.pendingReviewIds.has(String(id));
  }

  doReview(id, status, remark) {
    const key = String(id);
    if (this.pendingReviewIds.has(key)) return;
    this.pendingReviewIds.add(key);
    this.setData({ pendingReviewIds: [...this.pendingReviewIds] });
    return this.adminRequest(`/api/admin/applications/${id}/review`, 'POST', { status, remark })
      .then(() => {
        this.notify('已处理', 'success');
        this.fetchList(true);
      })
      .catch((err) => {
        // 已被其他管理员处理：给出提示并自动刷新，避免对着陈旧卡片反复点
        if (err && (err.code === 3003 || err.code === 1003)) {
          this.notify(err.message || '该登记已被其他管理员处理，列表已刷新');
          this.fetchList(true);
        }
      })
      .finally(() => {
        this.pendingReviewIds.delete(key);
        this.setData({ pendingReviewIds: [...this.pendingReviewIds] });
      });
  }

  loginBox() {
    return html`
      <div class="login-box">
        <div class="eyebrow">ADMIN CONSOLE</div>
        <div class="page-title">审核后台</div>
        <input class="key-input" name="adminUsername" autocomplete="username" placeholder="账号"
               value="${this.data.username}" data-input="onInputUsername" />
        <input class="key-input" name="adminPassword" type="password" autocomplete="current-password"
               placeholder="口令" value="${this.data.password}" data-input="onInputPassword" />
        <button type="button" class="btn" ${this.data.logging ? 'disabled' : ''} data-tap="login">
          ${this.data.logging ? '登录中 ···' : '登录'}
        </button>
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
        <div class="admin-head-right">
          <div class="count">${this.data.total}</div>
          <div class="logout tap" data-tap="logout">退出</div>
        </div>
      </div>

      <div class="checkin-bar">
        <button type="button" class="btn scan-btn" data-tap="scanCheckin">入场核验</button>
      </div>
      <div class="export-panel">
        <div class="export-title">导出名单</div>
        <p>每位参会人一行，包含个人及住宿信息、桌号、登记身份、审核状态与备注、入场核验状态及时间、签到状态、签到次数和首次／最近签到时间。选择“全部”可导出所有登记人员。</p>
        <div class="export-row">
          <span class="export-label">场次</span>
          ${['全部', '佛山', '济南', '上海'].map((cityItem) => html`
            <div class="export-chip tap ${cx({ active: this.data.exportCity === cityItem })}"
                 data-city="${cityItem}" data-tap="setExportCity">${cityItem}</div>`)}
        </div>
        <div class="export-row">
          <span class="export-label">状态</span>
          ${EXPORT_STATUS_OPTIONS.map(([statusItem, label]) => html`
            <div class="export-chip tap ${cx({ active: this.data.exportStatus === statusItem })}"
                 data-status="${statusItem}" data-tap="setExportStatus">${label}</div>`)}
        </div>
        <button type="button" class="btn export-btn" ${this.data.exporting ? 'disabled' : ''} data-tap="doExport">
          ${this.data.exporting ? '导出中 ···' : '导出 CSV 名单（Excel 可打开）'}
        </button>
        <button type="button" class="btn export-btn" ${this.data.exporting ? 'disabled' : ''} data-tap="exportCodes">
          导出抽奖码
        </button>
      </div>

      ${this.seatPanel()}
      ${this.entryQrPanel()}
      ${this.attendancePanel()}
      ${this.passPanel()}
      ${this.securityPanel()}
      ${this.lotterySettingsPanel()}
      ${this.userDevicePanel()}

      <div class="tabs">
        ${[['', '全部'], ['PENDING', '待审核'], ['APPROVED', '已通过'], ['REJECTED', '已驳回']].map(([status, label]) => html`
          <div class="tab tap ${cx({ active: this.data.statusFilter === status })}" data-status="${status}" data-tap="switchTab">${label}</div>
        `)}
      </div>
      <div class="export-row review-city-row">
        <span class="export-label">区域</span>
        ${['全部', '佛山', '济南', '上海'].map((cityItem) => html`
          <div class="export-chip tap ${cx({ active: this.data.reviewCity === cityItem })}"
               data-city="${cityItem}" data-tap="setReviewCity">${cityItem}</div>`)}
      </div>
      <form class="review-search" data-submit="searchReview">
        <input name="reviewName" type="search" maxlength="64" value="${this.data.reviewName}"
               placeholder="搜索姓名或手机号" data-input="onReviewNameInput" />
        <button type="submit" ${this.data.loading ? 'disabled' : ''}>${this.data.loading ? '搜索中 ···' : '搜索'}</button>
        <button type="button" ${this.data.loading ? 'disabled' : ''} data-tap="refreshReview">刷新</button>
        ${when(this.data.reviewName, html`<button type="button" data-tap="clearReviewName">清空</button>`)}
      </form>

      ${when(this.data.loading, () => html`<div class="searching-hint"><span class="spin"></span>加载中，请稍候…</div>`)}
      ${when(!this.data.loading && !this.data.list.length, html`<div class="empty">暂无登记记录</div>`)}

      ${this.data.list.map((item) => html`
        <div class="card">
          <div class="row">
            <span class="name">${item.name}</span>
            <span class="status ${item.status}">${item.checkedIn ? '已入场' : item.statusText}</span>
          </div>
          <div class="info">${item.phone} / ${item.company || '未填写'} / ${item.position || '未填写'}</div>
          ${when(item.matchedNames, html`<div class="info">匹配同行人：${item.matchedNames}</div>`)}
          ${when(item.status === 'PENDING' && item.dupNames, html`<div class="dup-name-warning">同名提醒：${item.dupNames} 已有相同姓名的参会登记，请注意审核</div>`)}
          ${when(item.reason, html`<div class="reason">${item.reason}</div>`)}
          ${when(item.reviewRemark, html`<div class="remark">审核备注：${item.reviewRemark}</div>`)}
          ${when(item.status !== 'PENDING' && item.reviewedAtText, html`<div class="info">审核：${item.reviewedByName || '—'} ${item.reviewedAtText}</div>`)}
          ${when(item.status === 'PENDING', () => html`
            <div class="actions">
              <button type="button" class="mini-btn approve" data-id="${item.id}" data-status="APPROVED" data-tap="review" ${this.isReviewPending(item.id) ? 'disabled' : ''}>${this.isReviewPending(item.id) ? '处理中' : '通过'}</button>
              <button type="button" class="mini-btn reject" data-id="${item.id}" data-status="REJECTED" data-tap="review" ${this.isReviewPending(item.id) ? 'disabled' : ''}>驳回</button>
            </div>
          `)}
        </div>
      `)}

      ${when(this.data.hasMore, html`<div class="more-hint">上拉加载更多</div>`)}
    `;
  }


  passPanel() {
    const pass = this.data.lastPass;
    return html`
      <div class="seat-panel">
        <div class="seat-head">
          <span>桌位图扫码入口</span>
          <span>只验证姓名 · 长期有效</span>
        </div>
        <div class="seat-row">
          <span class="seat-label">适用场次</span>
          <span class="seat-value tap" data-tap="onPassCityChange">
            ${this.data.passCityIndex === 0 ? '不限场次' : CITY_OPTIONS[this.data.passCityIndex - 1]} ›
          </span>
        </div>
        <div class="seat-row">
          <span class="seat-label">备注</span>
          <input class="pass-note" name="passNote" maxlength="32" value="${this.data.passNote}"
                 placeholder="如：上海场签到台" data-input="onPassNoteInput" />
        </div>
        <button type="button" class="btn seat-btn" ${this.data.passCreating ? 'disabled' : ''} data-tap="createPass">
          ${this.data.passCreating ? '生成中 ···' : '生成桌位图二维码'}
        </button>

        ${when(pass, () => html`
          <div class="pass-result">
            ${when(pass.qrBase64, html`<img class="pass-qr" src="data:image/png;base64,${pass.qrBase64}" alt="现场通道二维码" />`)}
            <div class="pass-url">${pass.url || '未配置网页地址（app.web-base-url）'}</div>
            ${when(pass.url, html`
              <button type="button" class="pass-copy" data-url="${pass.url}" data-tap="copyPassUrl">复制链接</button>
            `)}
          </div>
        `)}

        ${this.data.passes.filter((item) => item.enabled).map((item) => html`
          <div class="pass-row">
            <span>${item.eventCity || '不限场次'}${item.note ? ` · ${item.note}` : ''}</span>
            <span class="pass-disable tap" data-id="${item.id}" data-tap="disablePass">停用</span>
          </div>
        `)}
      </div>
    `;
  }

  securityPanel() {
    return html`
      <div class="seat-panel">
        <div class="seat-head">
          <span>安全设置</span>
          <span>点击开关即刻生效</span>
        </div>
        <div class="seat-row">
          <span class="seat-label">邀请人设备限制</span>
          <span class="seat-state ${this.data.inviterDeviceLimit ? 'on' : 'off'}">${this.data.inviterDeviceLimit ? '已开启' : '已关闭'}</span>
          <div class="pc-switch tap ${cx({ on: this.data.inviterDeviceLimit })}" data-role="inviter" data-tap="toggleDeviceLimit"></div>
        </div>
        <div class="seat-row">
          <span class="seat-label">普通嘉宾设备限制</span>
          <span class="seat-state ${this.data.guestDeviceLimit ? 'on' : 'off'}">${this.data.guestDeviceLimit ? '已开启' : '已关闭'}</span>
          <div class="pc-switch tap ${cx({ on: this.data.guestDeviceLimit })}" data-role="guest" data-tap="toggleDeviceLimit"></div>
        </div>
      </div>
    `;
  }

  userDevicePanel() {
    return html`
      <div class="seat-panel device-panel">
        <div class="seat-head">
          <span>用户设备管理</span>
          <span>${this.data.usersLoading ? '加载中' : `${this.data.users.length} 位用户`}</span>
        </div>
        ${when(!this.data.users.length, html`<div class="empty">暂无已登录用户</div>`)}
        ${this.data.users.map((user) => html`
          <div class="device-user-row">
            <div class="device-user-info">
              <strong>${user.name || '未填写姓名'}</strong>
              <span>${user.phone || '未授权手机号'} · ${user.deviceBound ? '设备已绑定' : '未绑定设备'}</span>
            </div>
            <div class="device-user-actions">
              <button type="button" data-id="${user.id}" data-tap="showLoginAudits">登录记录</button>
              <button type="button" data-id="${user.id}" data-tap="resetUserDevice" ${user.deviceBound ? '' : 'disabled'}>解绑设备</button>
            </div>
          </div>
        `)}
      </div>
    `;
  }

  setAttendanceCity(event, dataset) {
    const city = dataset.city || '全部';
    if (city === this.data.attendanceCity) return;
    this.assign({ attendanceCity: city });
    this.loadAttendance();
  }

  /**
   * 签到名单：按区域拉取全部参会人，已签到者按最近签到时间倒序排在最前，
   * 新签到的（30 分钟内）行高亮，方便现场一眼看到最新签到的人。
   */
  async loadAttendance() {
    this.assign({ attendanceLoading: true });
    const city = this.data.attendanceCity === '全部' ? '' : this.data.attendanceCity;
    try {
      const rows = await this.adminRequest(`/api/admin/export${city ? `?city=${encodeURIComponent(city)}` : ''}`);
      const checked = rows.filter((row) => row['签到状态'] === '已签到');
      const unchecked = rows.filter((row) => row['签到状态'] !== '已签到');
      checked.sort((a, b) => String(b['最近签到时间'] || '').localeCompare(String(a['最近签到时间'] || '')));
      this.setData({
        attendanceRows: checked.concat(unchecked),
        attendanceUpdatedAt: new Date().toTimeString().slice(0, 5),
      });
      this.scheduleAttendanceRefresh();
    } catch (_) {}
    this.assign({ attendanceLoading: false });
  }

  /** 名单加载后每 30 秒静默刷新，签到后最新的人自动排到最前。 */
  scheduleAttendanceRefresh() {
    if (this.attendanceTimer) {
      clearTimeout(this.attendanceTimer);
      this.timers.delete(this.attendanceTimer);
    }
    this.attendanceTimer = this.later(() => {
      this.attendanceTimer = null;
      this.loadAttendance();
    }, 30000);
  }

  /** 30 分钟内签过的行标记为“刚签到” */
  attFresh(row) {
    const latest = row['最近签到时间'];
    if (!latest) return false;
    const time = new Date(String(latest).replace('T', ' ').replace(/-/g, '/'));
    return Number.isFinite(time.getTime()) && Date.now() - time.getTime() < 30 * 60 * 1000;
  }

  async attendanceHistory(event, dataset) {
    const page = Number(dataset.page || 1);
    try {
      const history = await this.adminRequest(`/api/admin/attendance-records?applicationId=${dataset.id}&phone=${encodeURIComponent(dataset.phone)}&page=${page}`);
      this.setData({ attendanceHistory: history, attendancePerson: { id: dataset.id, phone: dataset.phone } });
    } catch (_) {}
  }

  attendancePanel() {
    const history = this.data.attendanceHistory || {};
    const person = this.data.attendancePerson || {};
    const rows = this.data.attendanceRows || [];
    const checkedCount = rows.filter((row) => row['签到状态'] === '已签到').length;
    return html`<div class="seat-panel">
      <div class="seat-head"><span>签到管理</span><span>每人独立签到，每次扫码保留记录</span></div>
      <div class="export-row attendance-city-row">
        <span class="export-label">区域</span>
        ${['全部', '佛山', '济南', '上海'].map((city) => html`
          <div class="export-chip tap ${cx({ active: this.data.attendanceCity === city })}"
               data-city="${city}" data-tap="setAttendanceCity">${city}</div>`)}
      </div>
      <button type="button" class="seat-file-btn" ${this.data.attendanceLoading ? 'disabled' : ''} data-tap="loadAttendance">
        ${this.data.attendanceLoading ? '刷新中 ···' : (rows.length ? '刷新签到名单' : '查看签到名单')}
      </button>
      ${when(rows.length, () => html`
        <div class="attendance-summary">
          已签到 ${checkedCount} 人 / 共 ${rows.length} 人 · 最新签到排在最前${this.data.attendanceUpdatedAt ? ` · ${this.data.attendanceUpdatedAt} 更新` : ''}
        </div>`)}
      <div style="overflow:auto;max-height:420px"><table class="pc-table"><thead><tr><th>姓名</th><th>手机号</th><th>场次</th><th>签到状态</th><th>次数</th><th>最近签到</th><th>明细</th></tr></thead><tbody>
      ${rows.map((row) => html`<tr class="${cx({ 'att-recent': this.attFresh(row) })}"><td>${row['姓名']}</td><td>${row['手机号']}</td><td>${row['场次']}</td><td>${row['签到状态']}</td><td>${row['签到次数']}</td><td>${row['最近签到时间'] ? String(row['最近签到时间']).replace('T', ' ') : '—'}</td><td><button type="button" class="seat-file-btn" data-tap="attendanceHistory" data-id="${row['登记编号']}" data-phone="${row['手机号']}">记录</button></td></tr>`)}</tbody></table></div>
      ${when(this.data.attendanceHistory, () => html`<p>${person.phone} · 共 ${history.total} 次签到</p>
        ${(history.records || []).map(record => html`<p>${record.name} · ${record.eventCity} · ${String(record.scannedAt).replace('T', ' ')}</p>`)}
        ${when(history.current > 1, html`<button type="button" class="seat-file-btn" data-tap="attendanceHistory" data-id="${person.id}" data-phone="${person.phone}" data-page="${history.current - 1}">上一页</button>`)}
        ${when(history.current < history.pages, html`<button type="button" class="seat-file-btn" data-tap="attendanceHistory" data-id="${person.id}" data-phone="${person.phone}" data-page="${history.current + 1}">下一页</button>`)}
      `)}
    </div>`;
  }

  entryQrPanel() {
    const qr = this.data.entryQr;
    return html`
      <div class="seat-panel">
        <div class="seat-head">
          <span>入口二维码</span>
          <span>扫码后正常登录</span>
        </div>
        <div class="seat-actions entry-actions">
          <button type="button" class="seat-file-btn" data-target="home" data-tap="showEntryQr">首页二维码</button>
          <button type="button" class="seat-file-btn" data-target="lottery" data-tap="showEntryQr">抽奖码二维码</button>
          <button type="button" class="seat-file-btn" data-target="checkin" data-tap="showEntryQr">签到码</button>
        </div>
        ${when(qr, () => html`
          <div class="pass-result">
            ${when(qr.qrBase64, html`<img class="pass-qr" src="data:image/png;base64,${qr.qrBase64}" alt="入口二维码" />`)}
            <div class="pass-url">${qr.url || '未配置网页地址（app.web-base-url）'}</div>
            ${when(qr.url, html`
              <button type="button" class="pass-copy" data-url="${qr.url}" data-tap="copyPassUrl">复制链接</button>
            `)}
          </div>
        `)}
      </div>
    `;
  }

  seatPanel() {
    return html`
      <div class="seat-panel">
        <div class="seat-head">
          <span>桌位分配</span>
          <span>${this.data.seatSummary}</span>
        </div>
        <div class="seat-row">
          <span class="seat-label">活动场次</span>
          <span class="seat-value tap" data-tap="onSeatCityChange">${CITY_OPTIONS[this.data.cityIndex]} ›</span>
        </div>
        <button type="button" class="btn seat-btn" data-tap="openSeatBoard">打开桌位分配表</button>
        <div class="seat-tip">左侧是按公司分组的人员，右侧是桌位；拖动人员到桌位上即可分配，保存后嘉宾端立即生效。</div>
      </div>
    `;
  }

  /* ---------- 电脑版界面 ---------- */

  pcSeatPanel() {
    return html`
      <div class="seat-panel">
        <div class="seat-head">
          <span>桌位分配</span>
          <span>${this.data.seatSummary}</span>
        </div>
        <div class="seat-row">
          <span class="seat-label">活动场次</span>
          <select class="pc-select" data-change="onSeatCitySelect">
            ${CITY_OPTIONS.map((cityItem) => html`<option value="${cityItem}" ${CITY_OPTIONS[this.data.cityIndex] === cityItem ? 'selected' : ''}>${cityItem}</option>`)}
          </select>
        </div>
        <button type="button" class="btn seat-btn" data-tap="openSeatBoard">打开桌位分配表</button>
        <div class="seat-tip">左侧是按公司分组的人员，右侧是桌位；拖动人员到桌位上即可分配，保存后嘉宾端立即生效。</div>
      </div>
    `;
  }

  pcPassPanel() {
    const pass = this.data.lastPass;
    return html`
      <div class="seat-panel">
        <div class="seat-head">
          <span>桌位图扫码入口</span>
          <span>只验证姓名 · 长期有效</span>
        </div>
        <div class="seat-row">
          <span class="seat-label">适用场次</span>
          <select class="pc-select" data-change="onPassCitySelect">
            ${['不限场次'].concat(CITY_OPTIONS).map((cityItem, index) => html`<option value="" ${index === 0 ? 'data-any="1"' : ''} ${this.data.passCityIndex === index ? 'selected' : ''}>${index === 0 ? '不限场次' : cityItem}</option>`)}
          </select>
        </div>
        <div class="seat-row">
          <span class="seat-label">备注</span>
          <input class="pass-note" name="passNote" maxlength="32" value="${this.data.passNote}"
                 placeholder="如：上海场签到台" data-input="onPassNoteInput" />
        </div>
        <button type="button" class="btn seat-btn" ${this.data.passCreating ? 'disabled' : ''} data-tap="createPass">
          ${this.data.passCreating ? '生成中 ···' : '生成桌位图二维码'}
        </button>

        ${when(pass, () => html`
          <div class="pass-result">
            ${when(pass.qrBase64, html`<img class="pass-qr" src="data:image/png;base64,${pass.qrBase64}" alt="现场通道二维码" />`)}
            <div class="pass-url">${pass.url || '未配置网页地址（app.web-base-url）'}</div>
            ${when(pass.url, html`
              <button type="button" class="pass-copy" data-url="${pass.url}" data-tap="copyPassUrl">复制链接</button>
            `)}
          </div>
        `)}

        ${this.data.passes.filter((item) => item.enabled).map((item) => html`
          <div class="pass-row">
            <span>${item.eventCity || '不限场次'}${item.note ? ` · ${item.note}` : ''}</span>
            <span class="pass-disable tap" data-id="${item.id}" data-tap="disablePass">停用</span>
          </div>
        `)}
      </div>
    `;
  }

  pcGoSection(event, dataset) {
    const target = document.getElementById(dataset.target);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this.el.querySelectorAll('.pc-nav a').forEach((a) => a.classList.toggle('active', a.dataset.target === dataset.target));
  }

  loadMore() {
    if (this.data.hasMore) this.fetchList(false);
  }

  onSeatCitySelect(event) {
    this.setData({ cityIndex: Math.max(0, CITY_OPTIONS.indexOf(event.target.value)) });
    this.loadSeatSummary();
  }


  onPassCitySelect(event) {
    this.setData({ passCityIndex: Math.max(0, CITY_OPTIONS.indexOf(event.target.value)) });
  }

  pcTemplate() {
    if (!this.data.logged) {
      return html`
        <div class="pc-shell pc-login-shell">
          <div class="pc-login-card">${this.loginBox()}</div>
        </div>
      `;
    }
    return this.pcShell(html`
      <section id="sec-review" class="pc-card">
        <div class="pc-card-head">
          <h3>登记审核</h3>
          <div class="pc-review-filters">
            <div class="pc-tabs">
              <span class="pc-filter-label">区域</span>
              ${['全部', '佛山', '济南', '上海'].map((cityItem) => html`
                <div class="pc-chip tap ${cx({ active: this.data.reviewCity === cityItem })}" data-city="${cityItem}" data-tap="setReviewCity">${cityItem}</div>`)}
            </div>
            <div class="pc-tabs">
              <span class="pc-filter-label">状态</span>
            ${[['', '全部'], ['PENDING', '待审核'], ['APPROVED', '已通过'], ['REJECTED', '已驳回']].map(([status, label]) => html`
              <div class="pc-chip tap ${cx({ active: this.data.statusFilter === status })}" data-status="${status}" data-tap="switchTab">${label}</div>`)}
            </div>
          </div>
        </div>
        <form class="pc-review-search" data-submit="searchReview">
          <input name="reviewName" type="search" maxlength="64" value="${this.data.reviewName}"
                 placeholder="搜索姓名或手机号" data-input="onReviewNameInput" />
          <button type="submit" class="pc-btn primary" ${this.data.loading ? 'disabled' : ''}>${this.data.loading ? '搜索中 ···' : '搜索'}</button>
          <button type="button" class="pc-btn ghost" ${this.data.loading ? 'disabled' : ''} data-tap="refreshReview">刷新</button>
          ${when(this.data.reviewName, html`<button type="button" class="pc-btn ghost" data-tap="clearReviewName">清空</button>`)}
        </form>
        ${when(this.data.loading, () => html`<div class="searching-hint"><span class="spin"></span>加载中，请稍候…</div>`)}
        <table class="pc-table">
          <thead>
            <tr><th>姓名</th><th>手机号</th><th>公司</th><th>职位</th><th>状态</th><th class="pc-col-actions">操作</th></tr>
          </thead>
          <tbody>
            ${this.data.list.map((item) => html`
              <tr>
                <td>${item.checkedIn ? '✓ ' : ''}${item.name}${when(item.matchedNames, html`<div class="pc-match-name">匹配同行人：${item.matchedNames}</div>`)}${when(item.status === 'PENDING' && item.dupNames, html`<div class="pc-dup-warning">同名提醒：${item.dupNames} 已有相同姓名的参会登记，请注意审核</div>`)}</td>
                <td>${item.phone}</td>
                <td>${item.company || '—'}</td>
                <td>${item.position || '—'}</td>
                <td><span class="pc-status ${item.status}">${item.checkedIn ? '已入场' : item.statusText}</span></td>
                <td class="pc-col-actions">
                  ${when(item.status === 'PENDING', () => html`
                    <button type="button" class="pc-btn small approve" data-id="${item.id}" data-status="APPROVED" data-tap="review" ${this.isReviewPending(item.id) ? 'disabled' : ''}>${this.isReviewPending(item.id) ? '处理中' : '通过'}</button>
                    <button type="button" class="pc-btn small reject" data-id="${item.id}" data-status="REJECTED" data-tap="review" ${this.isReviewPending(item.id) ? 'disabled' : ''}>驳回</button>`)}
                  ${when(item.status !== 'PENDING' && item.reviewRemark, html`<span class="pc-remark" title="${item.reviewRemark}">有备注</span>`)}
                  ${when(item.status !== 'PENDING' && item.reviewedAtText, html`<span class="pc-remark" title="${item.reviewedAtText}">${item.reviewedByName || '—'}</span>`)}
                </td>
              </tr>`)}
            ${when(!this.data.loading && !this.data.list.length, () => html`<tr><td colspan="6" class="pc-empty">暂无登记记录</td></tr>`)}
          </tbody>
        </table>
        ${when(this.data.hasMore, () => html`<button type="button" class="pc-btn ghost pc-load-more" data-tap="loadMore">加载更多</button>`)}
      </section>

      <section id="sec-export" class="pc-card">
        <div class="pc-card-head"><h3>导出名单</h3></div>
        <p>每位参会人一行，包含个人及住宿信息、桌号、登记身份、审核状态与备注、入场核验状态及时间、签到状态、签到次数和首次／最近签到时间。选择“全部”可导出所有登记人员。</p>
        <div class="pc-form-row">
          <span class="pc-form-label">场次</span>
          ${['全部', '佛山', '济南', '上海'].map((cityItem) => html`
            <div class="pc-chip tap ${cx({ active: this.data.exportCity === cityItem })}" data-city="${cityItem}" data-tap="setExportCity">${cityItem}</div>`)}
        </div>
        <div class="pc-form-row">
          <span class="pc-form-label">状态</span>
          ${EXPORT_STATUS_OPTIONS.map(([status, label]) => html`
            <div class="pc-chip tap ${cx({ active: this.data.exportStatus === status })}" data-status="${status}" data-tap="setExportStatus">${label}</div>`)}
        </div>
        <button type="button" class="pc-btn primary" ${this.data.exporting ? 'disabled' : ''} data-tap="doExport">
          ${this.data.exporting ? '导出中 ···' : '导出 CSV 名单'}
        </button>
        <button type="button" class="pc-btn ghost" ${this.data.exporting ? 'disabled' : ''} data-tap="exportCodes">
          导出抽奖码（按场次）
        </button>
      </section>

      <section id="sec-seats" class="pc-card">${this.pcSeatPanel()}</section>
      <section id="sec-entry" class="pc-card">${this.entryQrPanel()}
      ${this.attendancePanel()}${this.pcPassPanel()}</section>
      <section id="sec-security" class="pc-card">${this.securityPanel()}${this.lotterySettingsPanel()}</section>
      <section id="sec-devices" class="pc-card">${this.userDevicePanel()}</section>
    `);
  }

  pcShell(inner) {
    return html`
      <div class="pc-shell">
        <aside class="pc-side">
          <div class="pc-brand">审核后台<span>ADMIN CONSOLE</span></div>
          <nav class="pc-nav">
            ${[['sec-review', '登记审核'], ['sec-export', '导出名单'], ['sec-seats', '桌位分配'], ['sec-entry', '入口与通道'], ['sec-security', '安全设置'], ['sec-devices', '用户设备管理']].map(([id, label]) => html`
              <a class="${cx({ active: this.data.pcSection === id })}" data-target="${id}" data-tap="pcGoSection">${label}</a>`)}
          </nav>
          <div class="pc-side-foot">
            <div class="pc-admin">${this.data.adminName || '管理员'}</div>
            <button type="button" class="pc-logout" data-tap="logout">退出登录</button>
          </div>
        </aside>
        <main class="pc-main">
          <header class="pc-topbar">
            <div>
              <div class="pc-crumb">ADMIN CONSOLE</div>
              <div class="pc-top-title">审核后台</div>
            </div>
            <div class="pc-top-right">
              <span class="pc-count">${this.data.total}</span>
              <span class="pc-count-label">登记总数</span>
              <button type="button" class="pc-btn ghost" data-tap="scanCheckin">入场核验</button>
            </div>
          </header>
          <div class="pc-content" id="pcContent">${inner}</div>
        </main>
      </div>
    `;
  }

  template() {
    if (this.isPc()) return this.pcTemplate();
    return this.mobileTemplate();
  }

  mobileTemplate() {
    return html`
      <div class="page-scroll">
        <div class="container">
          ${this.data.logged ? this.console() : this.loginBox()}
        </div>
      </div>
    `;
  }
}
