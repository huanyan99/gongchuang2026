const app = getApp();

const STATUS_TEXT = { PENDING: '待审核', APPROVED: '已通过', REJECTED: '已驳回' };
const PAGE_SIZE = 20;

Page({
  data: {
    adminKey: '',
    logged: false,
    statusFilter: '',
    list: [],
    total: 0,
    page: 1,
    hasMore: false,
    loading: false,
    checkinName: '',
  },
  onShow() {
    const saved = wx.getStorageSync('adminKey');
    if (saved) {
      this.setData({ adminKey: saved });
      this.fetchList(true);
    }
  },
  onReachBottom() {
    if (this.data.logged && this.data.hasMore && !this.data.loading) {
      this.fetchList(false);
    }
  },
  onInputKey(e) {
    this.setData({ adminKey: e.detail.value });
  },
  login() {
    if (!String(this.data.adminKey || '').trim()) {
      wx.showToast({ title: '请输入管理密钥', icon: 'none' });
      return;
    }
    this.fetchList(true);
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
      'X-Admin-Key': this.data.adminKey,
    }).then((result) => {
      wx.setStorageSync('adminKey', this.data.adminKey);
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
      'X-Admin-Key': this.data.adminKey,
    }).then((guest) => {
      wx.showToast({ title: `核验通过：${(guest && guest.name) || '嘉宾'}`, icon: 'none' });
      this.setData({ checkinName: (guest && guest.name) || '' });
      this.fetchList(true);
    }).catch(() => {}).finally(() => {
      this._checking = false;
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
      'X-Admin-Key': this.data.adminKey,
    }).then(() => {
      wx.showToast({ title: '已处理' });
      this.fetchList(true);
    }).catch(() => {}).finally(() => {
      this._reviewing = false;
    });
  },
});
