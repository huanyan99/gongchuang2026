const app = getApp();

const STATUS_TEXT = {
  NONE: '未登记',
  PENDING: '审核中',
  APPROVED: '已通过',
  REJECTED: '已驳回',
};

function formatStayDate(value) {
  const parts = String(value || '').split('-');
  return parts.length === 3 ? `${Number(parts[1])}月${Number(parts[2])}日晚` : (value || '待确认');
}

Page({
  data: {
    redirect: '',
    inviteCode: '',
    wxLogged: false,
    profileReady: false,
    logging: false,
    name: '',
    gender: '',
    genderText: '',
    genderIndex: 0,
    genderOptions: ['男', '女'],
    applyRecord: null,
    recordStatus: 'NONE',
    recordStatusText: STATUS_TEXT.NONE,
    queryFailed: false,
  },
  onLoad(options) {
    this.setData({
      redirect: options.redirect ? decodeURIComponent(options.redirect) : '',
      inviteCode: options.inviteCode || '',
    });
    this.loadProfile();
  },
  onShow() {
    this.loadProfile();
  },
  loadProfile() {
    const profile = wx.getStorageSync('bochuMemberProfile') || {};
    const profileReady = !!(profile.name && profile.gender);
    this.setData({
      wxLogged: profileReady || this.data.wxLogged,
      profileReady,
      name: profile.name || this.data.name,
      gender: profile.gender || this.data.gender,
      genderText: profile.gender ? `${profile.gender}士` : '',
      genderIndex: profile.gender === '女' ? 1 : 0,
    });
    // 微信身份在 app.ensureLogin 中统一建立；个人中心始终优先查询数据库登记。
    app.ensureLogin()
      .then(() => this.fetchApplyRecord())
      .catch(() => this.setData({ queryFailed: true }));
  },
  fetchApplyRecord() {
    app.ensureLogin().then(() => app.request('/api/apply/me', 'GET', {}, {}, { silent: true })).then((record) => {
      if (record && Array.isArray(record.attendees)) {
        record.attendees = record.attendees.map((guest) => Object.assign({}, guest, {
          checkinDateText: formatStayDate(guest.checkinDate),
        }));
      }
      const primaryGuest = record && record.attendees && record.attendees.length
        ? record.attendees[0]
        : null;
      const databaseName = (record && record.name) || (primaryGuest && primaryGuest.name) || '';
      const databaseGender = (primaryGuest && primaryGuest.gender) || '';
      const status = record && record.status ? record.status : 'NONE';
      if (record && record.phone) {
        wx.setStorageSync('lastApplyPhone', record.phone);
      }
      this.setData({
        wxLogged: true,
        profileReady: !!databaseName,
        name: databaseName || this.data.name,
        gender: databaseGender || this.data.gender,
        genderText: databaseGender ? `${databaseGender}士` : this.data.genderText,
        genderIndex: databaseGender === '女' ? 1 : 0,
        applyRecord: record || null,
        recordStatus: status,
        recordStatusText: STATUS_TEXT[status] || status,
        queryFailed: false,
      });
      if (databaseName) {
        wx.setStorageSync('bochuMemberProfile', {
          name: databaseName,
          gender: databaseGender || this.data.gender || '',
        });
      }
    }).catch((err) => {
      if (err && err.code === 3002) {
        wx.removeStorageSync('lastApplyPhone');
        this.setData({
          applyRecord: null,
          recordStatus: 'NONE',
          recordStatusText: STATUS_TEXT.NONE,
          queryFailed: false,
        });
        return;
      }
      this.setData({ queryFailed: true });
    });
  },
  handleLogin() {
    if (this.data.logging) return;
    this.setData({ logging: true });
    app.relogin().then((token) => {
      if (!token) {
        wx.showToast({ title: '登录失败，请重试', icon: 'none' });
        this.setData({ logging: false });
        return;
      }
      this.setData({ wxLogged: true, logging: false });
    }).catch(() => {
      wx.showToast({ title: '登录失败，请重试', icon: 'none' });
      this.setData({ logging: false });
    });
  },
  onNameInput(e) {
    this.setData({ name: e.detail.value });
  },
  onGenderChange(e) {
    const genderIndex = Number(e.detail.value);
    this.setData({
      genderIndex,
      gender: this.data.genderOptions[genderIndex],
    });
  },
  completeLogin() {
    const name = this.data.name.trim();
    if (!name) {
      wx.showToast({ title: '请填写姓名', icon: 'none' });
      return;
    }
    if (!this.data.gender) {
      wx.showToast({ title: '请选择性别', icon: 'none' });
      return;
    }
    wx.setStorageSync('bochuMemberProfile', {
      name,
      gender: this.data.gender,
    });
    this.setData({
      profileReady: true,
      wxLogged: true,
      genderText: `${this.data.gender}士`,
    });
    wx.showToast({ title: '登录完成', icon: 'success' });
    setTimeout(() => {
      if (this.data.redirect) {
        wx.redirectTo({ url: this.data.redirect });
        return;
      }
      this.fetchApplyRecord();
    }, 520);
  },
  editProfile() {
    this.setData({ profileReady: false, wxLogged: true });
  },
  goApply() {
    const url = this.data.redirect || `/pages/apply/index?inviteCode=${this.data.inviteCode || ''}`;
    wx.navigateTo({ url });
  },
  openAgreement() {
    wx.navigateTo({ url: '/pages/agreement/index' });
  },
  openPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/index' });
  },
  requestPersonalInfoDeletion() {
    wx.showModal({
      title: '注销并删除个人信息',
      content: '请联系会务人员或发送邮件至 it@bochu.com。完成身份核验后，我们将为您办理注销及个人信息删除。',
      showCancel: false,
    });
  },
  goHome() {
    wx.redirectTo({ url: '/pages/index/index' });
  },
  goLottery() {
    if (!this.data.applyRecord || this.data.applyRecord.status !== 'APPROVED') {
      wx.showModal({
        title: '暂不可领取',
        content: '参会登记审核通过后方可领取抽奖码。',
        showCancel: false,
      });
      return;
    }
    wx.navigateTo({ url: '/pages/lottery/index' });
  },
});
