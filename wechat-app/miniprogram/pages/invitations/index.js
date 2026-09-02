const app = getApp();

Page({
  data: {
    cities: ['上海', '济南', '佛山'],
    creating: false, invitations: [], applications: [], filteredApplications: [], activeStatus: 'PENDING',
    selectedCity: '', showList: false,
    stats: { pending: 0, approved: 0, checkedIn: 0 },
  },
  onLoad() { this.refresh(); },
  onPullDownRefresh() { this.refresh().finally(() => wx.stopPullDownRefresh()); },
  refresh() {
    return app.ensureLogin().then(() => this.ensureCityInvitations()).then((invitations) => Promise.all([
      Promise.resolve(invitations), app.request('/api/invitations/applications', 'GET', {}, {}, { silent: true }),
    ])).then((results) => {
      let invitations = results[0];
      let applications = results[1];
      invitations = invitations || [];
      const cityByCode = {};
      invitations.forEach((item) => { cityByCode[item.code] = item.eventCity; });
      applications = (applications || []).map((item) => Object.assign({}, item, {
        eventCity: cityByCode[item.invitationCode] || '',
        statusText: this.statusText(item),
      }));
      const cards = this.data.cities.map((city) => invitations.find((item) => item.eventCity === city) || { eventCity: city, loading: true });
      const filteredApplications = this.filterApplications(applications, this.data.activeStatus, this.data.selectedCity);
      this.setData({
        invitations: cards, applications, filteredApplications,
        stats: this.statsForCity(applications, this.data.selectedCity),
      });
    }).catch((err) => {
      if (err && err.code === 1001) wx.navigateBack();
    });
  },
  ensureCityInvitations() {
    return app.request('/api/invitations/mine', 'GET', {}, {}, { silent: true }).then((rows) => {
      const existing = rows || [];
      const missing = this.data.cities.filter((city) => !existing.some((item) => item.eventCity === city));
      if (!missing.length) return existing;
      return Promise.all(missing.map((eventCity) => app.request('/api/invitations', 'POST', { eventCity, maxUses: 100 }, {}, { silent: true })))
        .then(() => app.request('/api/invitations/mine', 'GET', {}, {}, { silent: true }));
    });
  },
  statusText(item) {
    if (item.checkedInAt) return '已入场';
    return { PENDING: '待审核', APPROVED: '已审核', REJECTED: '已拒绝' }[item.status] || item.status;
  },
  statsForCity(applications, city) {
    const rows = applications.filter((item) => !city || item.eventCity === city);
    return {
      pending: rows.filter((item) => item.status === 'PENDING').length,
      approved: rows.filter((item) => item.status === 'APPROVED' && !item.checkedInAt).length,
      checkedIn: rows.filter((item) => !!item.checkedInAt).length,
    };
  },
  filterApplications(applications, status, city) {
    const cityRows = applications.filter((item) => !city || item.eventCity === city);
    if (status === 'CHECKED_IN') return cityRows.filter((item) => !!item.checkedInAt);
    if (status === 'APPROVED') return cityRows.filter((item) => item.status === 'APPROVED' && !item.checkedInAt);
    return cityRows.filter((item) => item.status === status);
  },
  selectStatus(e) {
    const activeStatus = e.currentTarget.dataset.status;
    this.setData({ activeStatus, filteredApplications: this.filterApplications(this.data.applications, activeStatus, this.data.selectedCity) });
  },
  openList(e) {
    const selectedCity = e.currentTarget.dataset.city;
    wx.navigateTo({ url: `/pages/invitation-list/index?city=${encodeURIComponent(selectedCity)}` });
  },
  copyPath(e) {
    const code = e.currentTarget.dataset.code;
    wx.setClipboardData({ data: `/pages/index/index?code=${code}` });
  },
  showMiniCode(e) {
    const code = e.currentTarget.dataset.code;
    app.request(`/api/invitations/${code}/mini-code`, 'GET', {}, {}, { silent: true }).then((data) => {
      if (!data || !data.imageBase64) throw new Error('empty');
      const file = `${wx.env.USER_DATA_PATH}/invite-${code}.png`;
      wx.getFileSystemManager().writeFile({
        filePath: file, data: data.imageBase64, encoding: 'base64',
        success: () => wx.previewImage({ urls: [file] }),
      });
    }).catch(() => wx.showModal({
      title: '小程序码待启用',
      content: '正式发布并配置微信 AppSecret 后即可生成。当前可先使用“转发邀请”。',
      showCancel: false,
    }));
  },
  review(e) {
    const id = e.currentTarget.dataset.id;
    const status = e.currentTarget.dataset.status;
    const action = status === 'APPROVED' ? '通过' : '拒绝';
    wx.showModal({ title: `${action}该登记？`, editable: status === 'REJECTED', placeholderText: '拒绝原因（可选）', success: (res) => {
      if (!res.confirm) return;
      app.request(`/api/invitations/applications/${id}/review`, 'POST', { status, remark: res.content || '' })
        .then(() => { wx.showToast({ title: `已${action}`, icon: 'success' }); this.refresh(); });
    } });
  },
  onShareAppMessage(e) {
    const code = e.target && e.target.dataset.code;
    return { title: '诚邀您参加柏楚2026价值共创峰会', path: `/pages/index/index?code=${encodeURIComponent(code || '')}` };
  },
});
