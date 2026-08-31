const app = getApp();

const STATUS_TEXT = { PENDING: '待审核', APPROVED: '已通过', REJECTED: '已驳回' };

Page({
  data: {
    adminKey: '',
    logged: false,
    statusFilter: '',
    list: [],
  },
  onShow() {
    const saved = wx.getStorageSync('adminKey');
    if (saved) {
      this.setData({ adminKey: saved });
      this.fetchList();
    }
  },
  onInputKey(e) {
    this.setData({ adminKey: e.detail.value });
  },
  login() {
    this.fetchList();
  },
  switchTab(e) {
    this.setData({ statusFilter: e.currentTarget.dataset.status || '' });
    this.fetchList();
  },
  fetchList() {
    const status = this.data.statusFilter;
    app.request(`/api/admin/applications${status ? `?status=${status}` : ''}`, 'GET', {}, {
      'X-Admin-Key': this.data.adminKey,
    }).then((list) => {
      wx.setStorageSync('adminKey', this.data.adminKey);
      this.setData({
        logged: true,
        list: (list || []).map((item) => ({ ...item, statusText: STATUS_TEXT[item.status] || item.status })),
      });
    });
  },
  review(e) {
    const { id, status } = e.currentTarget.dataset;
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
      content: '确定通过该申报吗？',
      success: (res) => {
        if (res.confirm) this.doReview(id, status, '');
      },
    });
  },
  doReview(id, status, remark) {
    app.request(`/api/admin/applications/${id}/review`, 'POST', { status, remark }, {
      'X-Admin-Key': this.data.adminKey,
    }).then(() => {
      wx.showToast({ title: '已处理' });
      this.fetchList();
    });
  },
});
