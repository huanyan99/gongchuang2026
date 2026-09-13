const app = getApp();

const STATUS_TEXT = { PENDING: '待审核', APPROVED: '已通过', REJECTED: '已驳回' };
const PAGE_SIZE = 20;
const CITY_OPTIONS = ['上海', '济南', '佛山'];
const MODE_OPTIONS = ['合并更新', '覆盖该场次'];
const PHONE = /^1\d{10}$/;

/**
 * 解析批量导入文本：每行「姓名,手机号,桌号」，多余的列忽略。
 * 行内出现逗号/分号/制表符时按分隔符切分，否则按空白切分；首行表头自动跳过。
 */
function parseSeatRows(text) {
  const rows = [];
  const invalidLines = [];
  let firstContentLine = true;

  String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).forEach((line, index) => {
    const raw = line.trim();
    if (!raw) return;
    if (firstContentLine && raw.indexOf('姓名') >= 0 && raw.indexOf('手机') >= 0) {
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

Page({
  data: {
    adminToken: '',
    adminName: '',
    username: '',
    password: '',
    logging: false,
    logged: false,
    statusFilter: '',
    list: [],
    total: 0,
    page: 1,
    hasMore: false,
    loading: false,
    checkinName: '',
    cityOptions: CITY_OPTIONS,
    cityIndex: 0,
    modeOptions: MODE_OPTIONS,
    modeIndex: 0,
    seatText: '',
    seatRows: [],
    seatParseTip: '支持从 Excel 直接复制粘贴，每行：姓名,手机号,桌号',
    seatImporting: false,
    seatSummary: '',
    guestDeviceLimit: false,
    inviterDeviceLimit: true,
  },
  onShow() {
    const saved = wx.getStorageSync('adminToken');
    if (saved && !this.data.logged) {
      this.setData({ adminToken: saved });
      app.request('/api/admin/session', 'GET', {}, {
        'X-Admin-Token': saved,
      }, { silent: true }).then((admin) => {
        this.setData({ adminName: (admin && admin.displayName) || '' });
        this.fetchList(true);
      }).catch(() => {
        wx.removeStorageSync('adminToken');
        this.setData({ adminToken: '', logged: false });
      });
    }
  },
  onReachBottom() {
    if (this.data.logged && this.data.hasMore && !this.data.loading) {
      this.fetchList(false);
    }
  },
  onInputUsername(e) {
    this.setData({ username: e.detail.value });
  },
  onInputPassword(e) {
    this.setData({ password: e.detail.value });
  },
  login() {
    if (this.data.logging) return;
    const username = String(this.data.username || '').trim();
    const password = String(this.data.password || '');
    if (!username || !password) {
      wx.showToast({ title: '请输入账号和口令', icon: 'none' });
      return;
    }
    this.setData({ logging: true });
    app.request('/api/admin/login', 'POST', { username, password })
      .then((result) => {
        wx.setStorageSync('adminToken', result.token);
        this.setData({ adminToken: result.token, adminName: result.displayName || username, password: '' });
        this.fetchList(true);
      })
      .catch(() => {})
      .finally(() => this.setData({ logging: false }));
  },
  logout() {
    app.request('/api/admin/logout', 'POST', {}, {
      'X-Admin-Token': this.data.adminToken,
    }, { silent: true }).catch(() => {});
    wx.removeStorageSync('adminToken');
    this.setData({ adminToken: '', adminName: '', logged: false, list: [], total: 0 });
  },
  switchTab(e) {
    this.setData({ statusFilter: e.currentTarget.dataset.status || '' });
    this.fetchList(true);
  },
  fetchList(reset) {
    if (this.data.loading && !reset) return;
    const page = reset ? 1 : this.data.page + 1;
    this.setData({ loading: true });
    const status = this.data.statusFilter;
    const query = `?page=${page}&size=${PAGE_SIZE}${status ? `&status=${encodeURIComponent(status)}` : ''}`;
    app.request(`/api/admin/applications${query}`, 'GET', {}, {
      'X-Admin-Token': this.data.adminToken,
    }).then((result) => {
      const records = ((result && result.records) || []).map((item) => Object.assign({}, item, {
        statusText: STATUS_TEXT[item.status] || item.status,
        checkedIn: !!item.checkedInAt,
      }));
      const list = reset ? records : this.data.list.concat(records);
      const total = Number((result && result.total) || 0);
      this.setData({
        logged: true,
        list,
        total,
        page,
        hasMore: list.length < total,
      });
      if (reset) {
        this.loadSeatSummary();
        this.loadSettings();
      }
    }).catch(() => {}).finally(() => this.setData({ loading: false }));
  },
  scanCheckin() {
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode'],
      success: (res) => {
        const token = (res.result || '').trim();
        if (!token) {
          wx.showToast({ title: '未识别到入场码', icon: 'none' });
          return;
        }
        this.doCheckin(token);
      },
      fail: () => {
        wx.showToast({ title: '已取消扫码', icon: 'none' });
      },
    });
  },
  doCheckin(token) {
    if (this._checking) return;
    this._checking = true;
    app.request('/api/admin/checkin', 'POST', { token }, {
      'X-Admin-Token': this.data.adminToken,
    }).then((guest) => {
      wx.showToast({ title: `核验通过：${(guest && guest.name) || '嘉宾'}`, icon: 'none' });
      this.setData({ checkinName: (guest && guest.name) || '' });
      this.fetchList(true);
    }).catch(() => {}).finally(() => {
      this._checking = false;
    });
  },
  loadSettings() {
    app.request('/api/admin/settings', 'GET', {}, {
      'X-Admin-Token': this.data.adminToken,
    }, { silent: true }).then((result) => {
      this.applySettings(result);
    }).catch(() => {});
  },
  applySettings(result) {
    this.setData({
      guestDeviceLimit: !!(result && result.device_binding_guests),
      inviterDeviceLimit: !!(result && result.device_binding_inviters),
    });
  },
  /** 设备限制开关：后端每次登录实时读库，改完即刻生效 */
  toggleDeviceLimit(e) {
    const inviter = e.currentTarget.dataset.role === 'inviter';
    const key = inviter ? 'device_binding_inviters' : 'device_binding_guests';
    const enabled = !(inviter ? this.data.inviterDeviceLimit : this.data.guestDeviceLimit);
    const who = inviter ? '邀请人' : '普通嘉宾';
    wx.showModal({
      title: enabled ? `开启${who}设备限制` : `关闭${who}设备限制`,
      content: enabled
        ? `开启后，${who}只能在首次登录的设备上登录。`
        : `关闭后，${who}可在任意设备登录。`,
      success: (res) => {
        if (!res.confirm) return;
        app.request(`/api/admin/settings/${key}?enabled=${enabled}`, 'POST', {}, {
          'X-Admin-Token': this.data.adminToken,
        }).then((result) => {
          this.applySettings(result);
          wx.showToast({ title: enabled ? '已开启' : '已关闭', icon: 'none' });
        }).catch(() => {});
      },
    });
  },
  onSeatCityChange(e) {
    this.setData({ cityIndex: Number(e.detail.value) }, () => this.loadSeatSummary());
  },
  onSeatModeChange(e) {
    this.setData({ modeIndex: Number(e.detail.value) });
  },
  onSeatTextInput(e) {
    const seatText = e.detail.value;
    const parsed = parseSeatRows(seatText);
    const invalid = parsed.invalidLines.length;
    this.setData({
      seatText,
      seatRows: parsed.rows,
      seatParseTip: seatText.trim()
        ? `已解析 ${parsed.rows.length} 位嘉宾${invalid ? `，第 ${parsed.invalidLines.slice(0, 5).join('、')} 行格式异常` : ''}`
        : '支持从 Excel 直接复制粘贴，每行：姓名,手机号,桌号',
    });
  },
  importSeats() {
    if (this.data.seatImporting) return;
    const rows = this.data.seatRows;
    if (!rows.length) {
      wx.showToast({ title: '请先粘贴桌位数据', icon: 'none' });
      return;
    }
    const eventCity = CITY_OPTIONS[this.data.cityIndex];
    const mode = this.data.modeIndex === 1 ? 'REPLACE' : 'MERGE';
    const confirmText = mode === 'REPLACE'
      ? `将清空${eventCity}场原有桌位，并导入 ${rows.length} 位嘉宾的桌号。`
      : `将按手机号更新或新增 ${rows.length} 位嘉宾的桌号。`;

    wx.showModal({
      title: '确认导入桌位',
      content: confirmText,
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ seatImporting: true });
        app.request('/api/admin/seats/import', 'POST', { eventCity, mode, rows }, {
          'X-Admin-Token': this.data.adminToken,
        }).then((result) => {
          const errors = (result.errors || []).map((item) => `第${item.line}行：${item.message}`);
          wx.showModal({
            title: '导入完成',
            content: `新增 ${result.created} 条，更新 ${result.updated} 条，失败 ${result.failed} 条。\n当前${eventCity}场共 ${result.tableCount} 桌 / ${result.guestCount} 人。${errors.length ? `\n${errors.slice(0, 5).join('\n')}` : ''}`,
            showCancel: false,
          });
          this.setData({ seatText: '', seatRows: [], seatParseTip: '支持从 Excel 直接复制粘贴，每行：姓名,手机号,桌号' });
          this.loadSeatSummary();
        }).catch(() => {}).finally(() => this.setData({ seatImporting: false }));
      },
    });
  },
  loadSeatSummary() {
    const eventCity = CITY_OPTIONS[this.data.cityIndex];
    app.request(`/api/admin/seats?city=${encodeURIComponent(eventCity)}&size=1`, 'GET', {}, {
      'X-Admin-Token': this.data.adminToken,
    }, { silent: true }).then((result) => {
      this.setData({ seatSummary: `${eventCity}场 ${result.tableCount} 桌 / ${result.guestCount} 人` });
    }).catch(() => this.setData({ seatSummary: '' }));
  },
  review(e) {
    const id = e.currentTarget.dataset.id;
    const status = e.currentTarget.dataset.status;
    if (status === 'REJECTED') {
      wx.showModal({
        title: '驳回',
        editable: true,
        placeholderText: '选填：驳回原因',
        success: (res) => {
          if (res.confirm) this.doReview(id, status, res.content || '');
        },
      });
      return;
    }
    wx.showModal({
      title: '确认通过',
      content: '确定通过该登记吗？',
      success: (res) => {
        if (res.confirm) this.doReview(id, status, '');
      },
    });
  },
  doReview(id, status, remark) {
    if (this._reviewing) return;
    this._reviewing = true;
    app.request(`/api/admin/applications/${id}/review`, 'POST', { status, remark }, {
      'X-Admin-Token': this.data.adminToken,
    }).then(() => {
      wx.showToast({ title: '已处理' });
      this.fetchList(true);
    }).catch(() => {}).finally(() => {
      this._reviewing = false;
    });
  },
});
