const app = getApp();

const WEATHER_STOPS = [
  { city: '佛山', date: '9月18日', temp: '23 ~ 30℃', weather: '小雨', icon: 'rainy', tip: '请备好雨具，预留抵达时间' },
  { city: '济南', date: '9月22日', temp: '17 ~ 28℃', weather: '多云', icon: 'cloudy', tip: '早晚温差明显，建议携带薄外套' },
  { city: '上海', date: '10月21日', temp: '----', weather: '', icon: 'cloudy', tip: '临近活动日期将自动更新天气' },
];

Page({
  data: {
    inviteCode: '',
    valid: null,
    weatherIndex: 0,
    weatherStops: WEATHER_STOPS,
    currentWeather: WEATHER_STOPS[0],
    homeBannerUrl: '/images/banner.jpg',
    pageScrollTop: 0,
    registrationStatus: '未登记',
    registrationStatusClass: 'unregistered',
    lotteryEligible: false,
    showPrivacyConsent: false,
    privacyChecked: false,
    invitationContext: null,
    canManageInvitations: false,
    lockedCity: '',
    hasServiceAccess: false,
    hasRegistrationRecord: false,
    registrationEventCity: '',
    invitationCanOverride: false,
  },
  onLoad(options) {
    const privacyAccepted = !!wx.getStorageSync('bochuPrivacyAccepted');
    this.setData({ showPrivacyConsent: !privacyAccepted });
    let sceneCode = '';
    if (options.scene) {
      const scene = decodeURIComponent(options.scene);
      sceneCode = scene.indexOf('i=') === 0 ? scene.substring(2) : scene;
    }
    // 邀请码只能来自本次打开参数；旧缓存不能自行恢复受邀场次。
    const inviteCode = options.code || options.inviteCode || sceneCode || '';
    this._launchInviteCode = inviteCode;
    this.setData({ inviteCode });
    if (!inviteCode) wx.removeStorageSync('activeInviteCode');
    this.loadEventWeather();
    // 必须先查询数据库登记；只有明确未登记时，当前邀请链接才有权锁定场次。
    this.syncApplyFlag()
      .then((record) => {
        if ((!record || record.status === 'REJECTED') && inviteCode) return this.validateInvitation(inviteCode);
        return null;
      })
      .catch(() => {});
  },
  onShow() {
    this.syncApplyFlag();
    this.loadInvitationPermission();
  },
  loadInvitationPermission() {
    app.ensureLogin().then(() => app.request('/api/invitations/permissions', 'GET', {}, {}, { silent: true }))
      .then((permission) => this.setData({
        canManageInvitations: !!(permission && (permission.canInvite || permission.canReview)),
      })).catch(() => this.setData({ canManageInvitations: false }));
  },
  /**
   * 会场归属，按优先级取：
   * 1. 已审核登记的场次
   * 2. 未审核登记 / 有效邀请码的场次
   * 3. 都没有：不锁定场次，参会服务不可用
   * 有归属才锁定城市标签并开放参会服务，避免 syncApplyFlag 与邀请码校验互相覆盖。
   */
  applyVenue() {
    const registered = this.data.registrationEventCity || '';
    const invited = this.data.valid === true && this.data.invitationContext
      ? (this.data.invitationContext.eventCity || '')
      : '';
    const lockedCity = registered || invited;
    const patch = { lockedCity, hasServiceAccess: !!lockedCity };

    const weatherIndex = this.data.weatherStops.findIndex((item) => item.city === lockedCity);
    if (weatherIndex >= 0) {
      patch.weatherIndex = weatherIndex;
      patch.currentWeather = this.data.weatherStops[weatherIndex];
    }
    this.setData(patch);
  },
  validateInvitation(inviteCode) {
    return app.request(`/api/apply/check-invitation?code=${encodeURIComponent(inviteCode)}`)
      .then((context) => {
        // 查询邀请期间若登记状态发生变化，仍以数据库登记为最高优先级。
        if (this.data.hasRegistrationRecord && !this.data.invitationCanOverride) return;
        wx.setStorageSync('activeInviteCode', inviteCode);
        this.setData({ inviteCode, valid: true, invitationContext: context || {} });
        this.applyVenue();
      })
      .catch(() => {
        if (this.data.hasRegistrationRecord && !this.data.invitationCanOverride) return;
        wx.removeStorageSync('activeInviteCode');
        this.setData({ valid: false, invitationContext: null });
        if (this.data.hasRegistrationRecord && this._databaseInvitationContext) {
          this.setData({
            inviteCode: this._databaseInviteCode || '',
            valid: true,
            invitationContext: this._databaseInvitationContext,
          });
        }
        this.applyVenue();
      });
  },
  loadEventWeather() {
    app.request('/api/events', 'GET', {}, {}, { silent: true }).then((rows) => {
      if (!Array.isArray(rows) || !rows.length) return;
      const weatherStops = WEATHER_STOPS.map((fallback) => {
        const row = rows.find((item) => String(item.city || '').replace(/场$/, '') === fallback.city);
        if (!row) return fallback;
        const dateParts = String(row.eventDate || '').split('-');
        const month = Number(dateParts[1]);
        const day = Number(dateParts[2]);
        const hasWeather = row.tempMin != null && row.tempMax != null && !!row.weatherText;
        return {
          city: fallback.city,
          date: month && day ? `${month}月${day}日` : fallback.date,
          temp: hasWeather ? `${row.tempMin} ~ ${row.tempMax}℃` : fallback.temp,
          weather: hasWeather ? row.weatherText : fallback.weather,
          icon: hasWeather ? (row.icon || fallback.icon) : fallback.icon,
          tip: hasWeather ? (row.tip || fallback.tip) : fallback.tip,
        };
      });
      const weatherIndex = Math.min(this.data.weatherIndex, weatherStops.length - 1);
      this.setData({
        weatherStops,
        weatherIndex,
        currentWeather: weatherStops[weatherIndex],
      });
      this.applyVenue();
    }).catch(() => {});
  },
  syncApplyFlag() {
    return app.ensureLogin()
      .then(() => app.request('/api/apply/me', 'GET', {}, {}, { silent: true }))
      .then((record) => {
        const checkedIn = !!(record && record.checkedInAt);
        const approved = record && record.status === 'APPROVED';
        const pending = record && record.status === 'PENDING';
        const rejected = record && record.status === 'REJECTED';
        const eventCity = record && record.eventCity ? record.eventCity : '';
        this.setData({
          registrationStatus: checkedIn ? '已入场' : (approved ? '已审核' : (pending ? '审核中' : '未登记')),
          registrationStatusClass: checkedIn ? 'checked-in' : (approved ? 'approved' : (pending ? 'pending' : 'unregistered')),
          lotteryEligible: !!approved,
          hasRegistrationRecord: !!record,
          registrationEventCity: eventCity,
          invitationCanOverride: !!rejected,
        });
        if (record && record.phone) {
          wx.setStorageSync('lastApplyPhone', record.phone);
        }
        if (record && record.eventCity) {
          const context = { eventCity: record.eventCity };
          this._databaseInvitationContext = context;
          this._databaseInviteCode = record.invitationCode || '';
          const waitingForRejectedInvite = rejected && !!this._launchInviteCode;
          if (!waitingForRejectedInvite) {
            if (record.invitationCode) wx.setStorageSync('activeInviteCode', record.invitationCode);
            else wx.removeStorageSync('activeInviteCode');
            this.setData({
              inviteCode: record.invitationCode || '',
              valid: true,
              invitationContext: context,
            });
          }
        }
        this.applyVenue();
        return record;
      })
      .catch((err) => {
        if (err && err.code === 3002) {
          wx.removeStorageSync('lastApplyPhone');
          this.setData({
            registrationStatus: '未登记',
            registrationStatusClass: 'unregistered',
            lotteryEligible: false,
            hasRegistrationRecord: false,
            registrationEventCity: '',
            invitationCanOverride: false,
          });
          this.applyVenue();
          return null;
        }
        return Promise.reject(err);
      });
  },
  goRegister() {
    // 微信身份已由 ensureLogin 建立；已有登记时直接读取数据库记录，
    // 不再把本地姓名性别缓存当作第二套登录状态。
    if (this.data.hasRegistrationRecord) {
      wx.navigateTo({
        url: `/pages/apply/index?record=1&inviteCode=${encodeURIComponent(this.data.inviteCode || '')}`,
      });
      return;
    }
    if (!this.data.inviteCode) {
      wx.showModal({
        title: '定向邀请活动',
        content: '本次活动采用定向邀请制，请通过主办方发送的专属邀请进入。',
        showCancel: false,
      });
      return;
    }
    if (this.data.inviteCode && this.data.valid === false) {
      wx.showToast({ title: '邀请码无效或已达上限', icon: 'none' });
      return;
    }
    if (this.data.inviteCode && this.data.valid !== true) {
      wx.showToast({ title: '正在校验邀请码', icon: 'none' });
      return;
    }
    const target = `/pages/apply/index?inviteCode=${encodeURIComponent(this.data.inviteCode || '')}`;
    wx.navigateTo({ url: target });
  },
  noop() {},
  togglePrivacyConsent() {
    this.setData({ privacyChecked: !this.data.privacyChecked });
  },
  openAgreement() {
    wx.navigateTo({ url: '/pages/agreement/index' });
  },
  openPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/index' });
  },
  openLotteryRules() {
    wx.navigateTo({ url: '/pages/lottery-rules/index' });
  },
  confirmPrivacyConsent() {
    if (!this.data.privacyChecked) {
      wx.showToast({ title: '请先阅读并勾选同意', icon: 'none' });
      return;
    }
    wx.setStorageSync('bochuPrivacyAccepted', {
      version: '2026-09-01',
      acceptedAt: Date.now(),
    });
    this.setData({ showPrivacyConsent: false });
  },
  onPageScrollView(e) {
    this._pageScrollTop = (e && e.detail && e.detail.scrollTop) || 0;
  },
  onHomeTap() {
    const current = this._pageScrollTop || 0;
    if (current <= 2) return;
    this.setData({ pageScrollTop: current }, () => {
      this.setData({ pageScrollTop: 0 });
    });
  },
  switchWeather(e) {
    const weatherIndex = Number(e.currentTarget.dataset.index);
    const target = this.data.weatherStops[weatherIndex];
    if (this.data.lockedCity && target && target.city !== this.data.lockedCity) return;
    this.setData({
      weatherIndex,
      currentWeather: this.data.weatherStops[weatherIndex],
    });
  },
  goProfile() {
    wx.navigateTo({ url: '/pages/login/index' });
  },
  // 宫格菜单
  onMenu(e) {
    const key = e.currentTarget.dataset.key;
    if (!this.data.hasServiceAccess && ['letter', 'agenda', 'route', 'seat'].includes(key)) {
      wx.showModal({
        title: '提示',
        content: '您好，无法查看',
        showCancel: false,
      });
      return;
    }
    if (key === 'register') {
      this.goRegister();
    } else if (key === 'lottery') {
      this.goLottery();
    } else if (key === 'invitations') {
      wx.navigateTo({ url: '/pages/invitations/index' });
    } else if (key === 'letter') {
      this.openServicePage('invitation-letter');
    } else if (key === 'agenda') {
      this.openServicePage('agenda');
    } else if (key === 'route') {
      this.openServicePage('route');
    } else if (key === 'seat') {
      this.openServicePage('seat');
    } else {
      wx.showToast({ title: '敬请期待', icon: 'none' });
    }
  },
  openServicePage(page) {
    const city = this.data.lockedCity || this.data.currentWeather.city || '';
    wx.navigateTo({ url: `/pages/${page}/index?city=${encodeURIComponent(city)}` });
  },
  goLottery() {
    if (!this.data.lotteryEligible) {
      wx.showModal({
        title: '暂不可领取',
        content: this.data.registrationStatus === '审核中'
          ? '您的参会登记正在审核中，审核通过后可领取抽奖码。'
          : '请先完成参会登记并等待审核通过，之后即可领取抽奖码。',
        showCancel: false,
      });
      return;
    }
    wx.navigateTo({ url: '/pages/lottery/index' });
  },
  // 入场码：查询自己的审核状态
  showTicket() {
    const phone = wx.getStorageSync('lastApplyPhone');
    if (!phone) {
      wx.showModal({
        title: '尚未登记',
        content: '请先完成参会登记，确认后即可生成入场核验二维码',
        confirmText: '去登记',
        success: (res) => {
          if (res.confirm) {
            this.goRegister();
          }
        },
      });
      return;
    }
    wx.navigateTo({ url: `/pages/apply/index?record=1&inviteCode=${encodeURIComponent(this.data.inviteCode || wx.getStorageSync('activeInviteCode') || '')}` });
  },
  goAdmin() {
    wx.navigateTo({ url: '/pages/admin/index' });
  },
  onShareAppMessage() {
    return {
      title: '诚邀您参加共创会',
      path: `/pages/index/index?code=${encodeURIComponent(this.data.inviteCode || '')}`,
    };
  },
});
