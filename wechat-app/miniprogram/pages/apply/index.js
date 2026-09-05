const app = getApp();
const COUNT_OPTIONS = [1,2,3,4,5,6,7,8,9,10];
const EVENT_DATES = { 佛山: '2026-09-18', 济南: '2026-09-22', 上海: '2026-10-21' };
const EVENT_STAY_LABELS = { 佛山: '9月18日晚', 济南: '9月22日晚', 上海: '10月21日晚' };

function blankAttendee(checkinDate) {
  return { name: '', company: '', sameCompany: false, gender: '男', phone: '', position: '', accommodation: '无需住宿', roomType: '柏楚预定房型', checkinDate };
}

function copyAttendee(item, changes) {
  return Object.assign({}, item, changes || {});
}

function attendeePayload(item) {
  const result = Object.assign({}, item);
  delete result.sameCompany;
  return result;
}

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
    editMode: false,
    editCount: 0,
    editRemaining: 2,
    countOptions: COUNT_OPTIONS,
    attendeeCount: 1,
    attendees: [blankAttendee('')],
    eventCity: '',
    eventStayLabel: '',
    genderOptions: ['男', '女'],
    accommodationOptions: ['无需住宿', '需要住宿'],
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
    const shouldLoadRecord = options.ticket === '1' || options.record === '1';
    if (!shouldLoadRecord) {
      app.ensureLogin().then(() => app.request('/api/auth/me', 'GET', {}, {}, { silent: true }))
        .then((user) => {
          // 只预填空白的主要联系人号码；不覆盖手动输入、同行人或已有登记。
          if (user.phoneCountryCode === '86' && /^1\d{10}$/.test(user.phone || '')
              && !this.data.phone && !this.data.attendees[0].phone && !this._phoneEdited) {
            this.setData({ phone: user.phone, 'attendees[0].phone': user.phone });
          }
        }).catch(() => {});
    }
    if (this.data.inviteCode) {
      app.request(`/api/apply/check-invitation?code=${encodeURIComponent(this.data.inviteCode)}`, 'GET', {}, {}, { silent: true }).then((context) => {
        const eventCity = context.eventCity || '';
        const checkinDate = EVENT_DATES[eventCity] || '';
        const attendees = this.data.attendees.map((item) => copyAttendee(item, { checkinDate }));
        attendees[0] = copyAttendee(attendees[0], { name: this.data.name, phone: this.data.phone, company: this.data.company, position: this.data.position });
        this.setData({ eventCity, eventStayLabel: EVENT_STAY_LABELS[eventCity] || '活动当晚', attendees });
      }).catch(() => {}).finally(() => {
        if (shouldLoadRecord) this.loadApplication();
      });
    } else if (shouldLoadRecord) {
      this.loadApplication();
    }
  },
  onShow() {
    // 登记状态页不再使用动态入场二维码。
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
  onAttendeeCountChange(e) {
    const attendeeCount = COUNT_OPTIONS[Number(e.detail.value)];
    const attendees = this.data.attendees.slice(0, attendeeCount);
    while (attendees.length < attendeeCount) attendees.push(blankAttendee(EVENT_DATES[this.data.eventCity] || ''));
    this.setData({ attendeeCount, attendees });
  },
  onGuestInput(e) {
    const index = Number(e.currentTarget.dataset.index);
    const field = e.currentTarget.dataset.field;
    const attendees = this.data.attendees.slice();
    if (index === 0 && field === 'phone') this._phoneEdited = true;
    attendees[index] = copyAttendee(attendees[index]);
    attendees[index][field] = e.detail.value;
    if (index === 0 && field === 'company') {
      attendees.forEach((item, i) => { if (i > 0 && item.sameCompany) attendees[i] = copyAttendee(item, { company: e.detail.value }); });
    }
    this.setData({ attendees });
  },
  onGenderChange(e) {
    const attendees = this.data.attendees.slice();
    attendees[Number(e.currentTarget.dataset.index)].gender = ['男', '女'][Number(e.detail.value)];
    this.setData({ attendees });
  },
  onAccommodationChange(e) {
    const attendees = this.data.attendees.slice();
    attendees[Number(e.currentTarget.dataset.index)].accommodation = ['无需住宿', '需要住宿'][Number(e.detail.value)];
    this.setData({ attendees });
  },
  onSameCompany(e) {
    const index = Number(e.currentTarget.dataset.index);
    const attendees = this.data.attendees.slice();
    const sameCompany = e.detail.value.length > 0;
    attendees[index] = copyAttendee(attendees[index], { sameCompany, company: sameCompany ? attendees[0].company : '' });
    this.setData({ attendees });
  },
  submit() {
    if (!wx.getStorageSync('bochuPrivacyAccepted')) {
      wx.showModal({
        title: '请先同意相关协议',
        content: '请返回首页阅读并同意《用户服务协议》和《隐私政策》后再提交登记。',
        showCancel: false,
      });
      return;
    }
    if (this.data.submitting) return;
    const attendees = this.data.attendees.map((item) => copyAttendee(item, {
      name: item.name.trim(),
      company: item.company.trim(),
      phone: item.phone.trim(),
      position: item.position.trim(),
    }));
    for (let i = 0; i < attendees.length; i += 1) {
      if (!attendees[i].name) return wx.showToast({ title: `请填写第${i + 1}位姓名`, icon: 'none' });
      if (!/^1\d{10}$/.test(attendees[i].phone)) return wx.showToast({ title: `第${i + 1}位手机号有误`, icon: 'none' });
    }
    const name = attendees[0].name;
    const phone = attendees[0].phone;
    if (!this.data.inviteCode && !this.data.editMode) return wx.showToast({ title: '缺少邀请码', icon: 'none' });

    this.setData({ submitting: true, name, phone });
    const payload = {
      invitationCode: this.data.inviteCode,
      name,
      phone,
      company: this.data.company,
      position: this.data.position,
      reason: this.data.reason,
      attendeeCount: attendees.length,
      attendees: attendees.map(attendeePayload),
    };
    app.ensureLogin().then(() => app.request('/api/apply', this.data.editMode ? 'PUT' : 'POST', payload)).then(() => {
      wx.setStorageSync('lastApplyPhone', phone);
      wx.setStorageSync('bochuApplyProfile', {
        name: attendees[0].name,
        phone,
        company: attendees[0].company,
        position: attendees[0].position,
        reason: this.data.reason,
      });
      this.loadApplication();
    }).catch(() => {}).finally(() => this.setData({ submitting: false }));
  },
  loadApplication() {
    app.ensureLogin().then(() => app.request('/api/apply/me')).then((record) => {
      this.applyRecord(record);
    }).catch((err) => {
      if (err && err.code === 3002) {
        this.setData({ submitted: false });
      }
    });
  },
  applyRecord(record) {
    const inviteOverride = record.status === 'REJECTED'
      && !!this.data.inviteCode
      && !!this.data.eventCity
      && this.data.inviteCode !== record.invitationCode;
    const eventCity = inviteOverride ? this.data.eventCity : (record.eventCity || this.data.eventCity);
    const attendees = (record.attendees || []).map((guest) => copyAttendee(guest, {
      sameCompany: false,
      checkinDate: inviteOverride ? (EVENT_DATES[eventCity] || '') : (guest.checkinDate || EVENT_DATES[eventCity] || ''),
    }));
    const editCount = Number(record.editCount || 0);
    this.setData({
      submitted: true,
      editMode: false,
      applyStatus: record.status || '',
      name: record.name || this.data.name,
      phone: record.phone || this.data.phone,
      company: record.company || '',
      position: record.position || '',
      reason: record.reason || '',
      attendees: attendees.length ? attendees : this.data.attendees,
      attendeeCount: attendees.length || 1,
      eventCity,
      inviteCode: inviteOverride ? this.data.inviteCode : (record.invitationCode || this.data.inviteCode),
      eventStayLabel: EVENT_STAY_LABELS[eventCity] || '活动当晚',
      editCount,
      editRemaining: Math.max(0, 2 - editCount),
    });
    this.clearQrTimer();
  },
  startEdit() {
    if (this.data.editRemaining <= 0) {
      wx.showModal({ title: '无法修改', content: '每份登记信息最多修改两次。', showCancel: false });
      return;
    }
    wx.showModal({
      title: '修改登记信息',
      content: `每人共有两次修改机会，您还剩 ${this.data.editRemaining} 次。修改提交后需要重新审核。`,
      confirmText: '开始修改',
      success: (res) => {
        if (res.confirm) this.setData({ submitted: false, editMode: true });
      },
    });
  },
  goLottery() {
    wx.navigateTo({ url: '/pages/lottery/index' });
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
