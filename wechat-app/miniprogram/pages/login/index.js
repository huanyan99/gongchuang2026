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
    maskedPhone: '',
    name: '',
    gender: '',
    genderText: '',
    genderIndex: 0,
    genderOptions: ['男', '女'],
    hintKnown: false,
    maskedPrefix: '',
    maskedSuffix: '',
    missingCount: 0,
    nameBlank: '',
    verifying: false,
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
      profileReady,
      name: profile.name || this.data.name,
      gender: profile.gender || this.data.gender,
      genderText: profile.gender ? `${profile.gender}士` : '',
      genderIndex: profile.gender === '女' ? 1 : 0,
    });
    // 微信身份在 app.ensureLogin 中统一建立；个人中心始终优先查询数据库登记。
    app.ensureLogin()
      .then(() => {
        return app.request('/api/auth/me', 'GET', {}, {}, { silent: true });
      })
      .then((user) => {
        this.showAuthorizedPhone(user);
        if (user.name && user.gender) {
          this.setData({ profileReady: true, name: user.name, gender: user.gender, genderText: user.gender + '士', genderIndex: user.gender === '女' ? 1 : 0 });
          wx.setStorageSync('bochuMemberProfile', { name: user.name, gender: user.gender });
        }
        // 静默建立 OpenID 不等于用户已点击登录；未授权时保留统一登录入口。
        this.setData({ wxLogged: !!user.phone || this.data.wxLogged });
        if (user.phone && !user.name) this.loadPhoneHint(user.phone);
        return this.fetchApplyRecord();
      })
      .catch(() => this.setData({ queryFailed: true }));
  },
  showAuthorizedPhone(user) {
    const phone = (user && user.phone) || '';
    this.setData({ maskedPhone: phone ? phone.slice(0, 3) + '****' + phone.slice(-4) : '' });
  },
  fetchApplyRecord() {
    return app.ensureLogin().then(() => app.request('/api/apply/me', 'GET', {}, {}, { silent: true })).then((record) => {
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
  handleLogin(e) {
    if (this.data.logging) return;
    const phoneCode = e && e.detail && e.detail.code;
    this.setData({ logging: true });
    return app.ensureLogin().then(() => {
      if (!phoneCode) return null;
      return app.request('/api/auth/phone', 'POST', { code: phoneCode }, {}, { silent: true });
    }).then((result) => {
      if (result) this.showAuthorizedPhone(result);
      this.setData({ wxLogged: true });
      wx.showToast({ title: result ? '登录成功' : '已登录，手机号可手动填写', icon: 'none' });
      return this.fetchApplyRecord();
    }).catch((err) => {
      const stage = (err && err.stage) || '登录';
      const code = err && err.code != null ? err.code : '未知';
      // 只记录阶段和错误码，不打印 token、登录 code、请求体或用户资料。
      console.warn('[login failed]', stage, code);
      wx.showModal({
        title: '登录失败',
        content: `${(err && err.message) || '请稍后重试'}\n阶段：${stage}\n错误码：${code}`,
        showCancel: false,
      });
    }).finally(() => this.setData({ logging: false }));
  },
  /** 手机号已在参会登记中出现过时，只需补全姓名中被隐藏的字 */
  loadPhoneHint(phone) {
    return app.request('/api/auth/phone-hint', 'POST', { phone }, {}, { silent: true }).then((hint) => {
      const masked = (hint && hint.maskedName) || '';
      const first = masked.indexOf('*');
      const last = masked.lastIndexOf('*');
      this.setData({
        hintKnown: !!(hint && hint.known),
        maskedPrefix: first < 0 ? '' : masked.slice(0, first),
        maskedSuffix: first < 0 ? '' : masked.slice(last + 1),
        missingCount: (hint && hint.missingCount) || 0,
        nameBlank: '',
      });
    }).catch(() => this.setData({ hintKnown: false }));
  },
  onNameBlankInput(e) {
    this.setData({ nameBlank: e.detail.value });
  },
  verifyName() {
    if (this.data.verifying) return;
    const blank = String(this.data.nameBlank || '').trim();
    if (blank.length !== this.data.missingCount) {
      wx.showToast({ title: '请补全姓名', icon: 'none' });
      return;
    }
    const name = `${this.data.maskedPrefix}${blank}${this.data.maskedSuffix}`;
    this.setData({ verifying: true });
    app.request('/api/auth/profile/verify', 'POST', { name })
      .then((user) => {
        wx.setStorageSync('bochuMemberProfile', { name: user.name, gender: user.gender || '' });
        this.setData({
          profileReady: true,
          name: user.name,
          gender: user.gender || '',
          genderText: user.gender ? `${user.gender}士` : '',
          genderIndex: user.gender === '女' ? 1 : 0,
        });
        wx.showToast({ title: '登录成功', icon: 'success' });
        this.fetchApplyRecord();
      })
      .catch(() => {})
      .finally(() => this.setData({ verifying: false }));
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
    app.request('/api/auth/profile', 'PUT', { name, gender: this.data.gender }).then(() => {
      wx.setStorageSync('bochuMemberProfile', { name, gender: this.data.gender });
      this.setData({ profileReady: true, wxLogged: true, genderText: `${this.data.gender}士` });
      wx.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => {
      if (this.data.redirect) {
        wx.redirectTo({ url: this.data.redirect });
        return;
      }
      this.fetchApplyRecord();
      }, 520);
    }).catch(() => {});
  },
  editProfile() {
    this.setData({ profileReady: false, wxLogged: true });
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
