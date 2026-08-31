const app = getApp();

Page({
  data: {
    inviteCode: '',
    name: '',
    phone: '',
    company: '',
    position: '',
    reason: '',
    submitting: false,
    submitted: false,
    applyStatus: '',
    ticketNo: '',
    qrImage: '',
    qrSeconds: 120,
    checkedIn: false,
  },
  onLoad(options) {
    const memberProfile = wx.getStorageSync('bochuMemberProfile') || {};
    const applyProfile = wx.getStorageSync('bochuApplyProfile') || {};
    this.setData({
      inviteCode: (options.inviteCode || '').trim(),
      name: applyProfile.name || memberProfile.name || '',
      phone: applyProfile.phone || '',
      company: applyProfile.company || '',
      position: applyProfile.position || '',
      reason: applyProfile.reason || '',
    });
    if (options.ticket === '1') {
      this.loadTicket();
    }
  },
  onShow() {
    if (this.data.submitted && this.data.applyStatus === 'APPROVED' && !this.data.checkedIn && !this.qrTimer) {
      this.startQrTimer();
    }
  },
  onHide() {
    this.clearQrTimer();
  },
  onUnload() {
    this.clearQrTimer();
  },
  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },
  submit() {
    if (this.data.submitting) return;
    const name = (this.data.name || '').trim();
    const phone = (this.data.phone || '').trim();
    if (!name) return wx.showToast({ title: '请填写姓名', icon: 'none' });
    if (!/^1\d{10}$/.test(phone)) return wx.showToast({ title: '手机号格式不正确', icon: 'none' });
    if (!this.data.inviteCode) return wx.showToast({ title: '缺少邀请码', icon: 'none' });

    this.setData({ submitting: true, name, phone });
    app.ensureLogin().then(() => app.request('/api/apply', 'POST', {
      invitationCode: this.data.inviteCode,
      name,
      phone,
      company: this.data.company,
      position: this.data.position,
      reason: this.data.reason,
    })).then(() => {
      wx.setStorageSync('lastApplyPhone', phone);
      wx.setStorageSync('bochuApplyProfile', {
        name: this.data.name,
        phone,
        company: this.data.company,
        position: this.data.position,
        reason: this.data.reason,
      });
      this.loadTicket();
    }).catch(() => {}).finally(() => this.setData({ submitting: false }));
  },
  loadTicket() {
    app.ensureLogin().then(() => app.request('/api/apply/ticket')).then((ticket) => {
      this.applyTicket(ticket);
    }).catch((err) => {
      if (err && err.code === 3002) {
        this.setData({ submitted: false });
      }
    });
  },
  applyTicket(ticket) {
    const qrImage = ticket.qrBase64 ? `data:image/png;base64,${ticket.qrBase64}` : '';
    this.setData({
      submitted: true,
      applyStatus: ticket.status || '',
      ticketNo: ticket.ticketNo || '',
      name: ticket.name || this.data.name,
      phone: ticket.phone || this.data.phone,
      qrImage,
      qrSeconds: ticket.expireSeconds || 120,
      checkedIn: !!ticket.checkedIn,
    });
    if (ticket.status === 'APPROVED' && !ticket.checkedIn && ticket.qrBase64) {
      this.startQrTimer();
    } else {
      this.clearQrTimer();
    }
  },
  startQrTimer() {
    this.clearQrTimer();
    this.qrTimer = setInterval(() => {
      const nextSeconds = this.data.qrSeconds - 1;
      if (nextSeconds > 0) {
        this.setData({ qrSeconds: nextSeconds });
        return;
      }
      this.clearQrTimer();
      this.refreshQr();
    }, 1000);
  },
  refreshQr() {
    app.request('/api/apply/ticket', 'GET', {}, {}, { silent: true }).then((ticket) => {
      this.applyTicket(ticket);
    }).catch(() => {
      this.setData({ qrSeconds: 120 });
    });
  },
  clearQrTimer() {
    if (this.qrTimer) {
      clearInterval(this.qrTimer);
      this.qrTimer = null;
    }
  },
  backHome() {
    wx.redirectTo({ url: '/pages/index/index' });
  },
});
