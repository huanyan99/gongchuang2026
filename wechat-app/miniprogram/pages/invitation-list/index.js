const app = getApp();

function formatStayDate(value) {
  const parts = String(value || '').split('-');
  return parts.length === 3 ? `${Number(parts[1])}月${Number(parts[2])}日晚` : (value || '待确认');
}

Page({
  data: {
    city: '', activeStatus: 'PENDING', applications: [], filteredApplications: [],
    stats: { pending: 0, approved: 0, checkedIn: 0 }, loading: true,
  },
  onLoad(options) {
    this.setData({ city: decodeURIComponent(options.city || '') });
    this.refresh();
  },
  onPullDownRefresh() { this.refresh().finally(() => wx.stopPullDownRefresh()); },
  refresh() {
    this.setData({ loading: true });
    return app.ensureLogin().then(() => Promise.all([
      app.request('/api/invitations/mine', 'GET', {}, {}, { silent: true }),
      app.request('/api/invitations/applications', 'GET', {}, {}, { silent: true }),
    ])).then((results) => {
      const invitations = results[0];
      const applications = results[1];
      const cityByCode = {};
      (invitations || []).forEach((item) => { cityByCode[item.code] = item.eventCity; });
      const rows = (applications || []).filter((item) => cityByCode[item.invitationCode] === this.data.city)
        .map((item) => Object.assign({}, item, {
          statusText: this.statusText(item),
          attendees: (item.attendees || []).map((guest) => Object.assign({}, guest, {
            checkinDateText: formatStayDate(guest.checkinDate),
          })),
        }));
      this.setData({
        applications: rows,
        filteredApplications: this.filterRows(rows, this.data.activeStatus),
        stats: {
          pending: rows.filter((item) => item.status === 'PENDING').length,
          approved: rows.filter((item) => item.status === 'APPROVED' && !item.checkedInAt).length,
          checkedIn: rows.filter((item) => !!item.checkedInAt).length,
        },
      });
    }).finally(() => this.setData({ loading: false }));
  },
  statusText(item) {
    if (item.checkedInAt) return '已入场';
    return { PENDING: '待审核', APPROVED: '已审核', REJECTED: '已拒绝' }[item.status] || item.status;
  },
  filterRows(rows, status) {
    if (status === 'CHECKED_IN') return rows.filter((item) => !!item.checkedInAt);
    if (status === 'APPROVED') return rows.filter((item) => item.status === 'APPROVED' && !item.checkedInAt);
    return rows.filter((item) => item.status === status);
  },
  selectStatus(e) {
    const activeStatus = e.currentTarget.dataset.status;
    this.setData({ activeStatus, filteredApplications: this.filterRows(this.data.applications, activeStatus) });
  },
  review(e) {
    const id = e.currentTarget.dataset.id;
    const status = e.currentTarget.dataset.status;
    const action = status === 'APPROVED' ? '通过' : '拒绝';
    wx.showModal({
      title: `${action}该登记？`, editable: status === 'REJECTED', placeholderText: '拒绝原因（可选）',
      success: (res) => {
        if (!res.confirm) return;
        app.request(`/api/invitations/applications/${id}/review`, 'POST', { status, remark: res.content || '' })
          .then(() => { wx.showToast({ title: `已${action}`, icon: 'success' }); this.refresh(); });
      },
    });
  },
});
