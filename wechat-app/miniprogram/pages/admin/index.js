const app = getApp();

const STATUS_TEXT = { PENDING: '待审核', APPROVED: '已通过', REJECTED: '已驳回' };
const PAGE_SIZE = 20;
const CITY_OPTIONS = ['上海', '济南', '佛山'];

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
  loadSeatSummary() {
    const eventCity = CITY_OPTIONS[this.data.cityIndex];
    app.request(`/api/admin/seats/board?city=${encodeURIComponent(eventCity)}&summaryOnly=true`, 'GET', {}, {
      'X-Admin-Token': this.data.adminToken,
    }, { silent: true }).then((result) => {
      const summary = result.summary || {};
      this.setData({
        seatSummary: `${eventCity}场 ${summary.tableCount || 0} 桌 / ${summary.peopleCount || 0} 人 · 已分配 ${summary.assigned || 0}`,
      });
    }).catch(() => this.setData({ seatSummary: '' }));
  },

  /** 小程序端只提供统计：分配请用电脑端后台的拖拽看板 */
  showSeatBoardHint() {
    wx.showModal({
      title: '桌位分配请用电脑端',
      content: '电脑端登录审核后台 → 桌位分配，左侧人员、右侧桌位，可拖动分配并保存。小程序端只显示统计。',
      showCancel: false,
    });
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
