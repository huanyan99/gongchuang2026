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
    showInviteDialog: false,
    weatherIndex: 0,
    weatherStops: WEATHER_STOPS,
    currentWeather: WEATHER_STOPS[0],
    homeBannerUrl: '/images/banner.png',
    pageScrollTop: 0,
    registrationStatus: '未登记',
    registrationStatusClass: 'unregistered',
    invitationContext: null,
    canManageInvitations: false,
    lockedCity: '',
    hasServiceAccess: false,
  },
  onLoad(options) {
    let sceneCode = '';
    if (options.scene) {
      const scene = decodeURIComponent(options.scene);
      sceneCode = scene.indexOf('i=') === 0 ? scene.substring(2) : scene;
    }
    const inviteCode = options.code || options.inviteCode || sceneCode || wx.getStorageSync('activeInviteCode') || '';
    this.setData({ inviteCode });
    this.loadEventWeather();
    if (inviteCode) {
      app.request(`/api/apply/check-invitation?code=${encodeURIComponent(inviteCode)}`).then((context) => {
        wx.setStorageSync('activeInviteCode', inviteCode);
        this.applyInvitationContext(context || {});
        this.setData({ valid: true, invitationContext: context || {}, hasServiceAccess: true });
      }).catch(() => {
        wx.removeStorageSync('activeInviteCode');
        this.setData({ valid: false });
      });
    }
    this.syncApplyFlag().then(() => this.prepareInviteDialog());
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
  applyInvitationContext(context) {
    if (!context || !context.eventCity) return;
    const weatherIndex = this.data.weatherStops.findIndex((item) => item.city === context.eventCity);
    if (weatherIndex >= 0) {
      this.setData({
        weatherIndex,
        currentWeather: this.data.weatherStops[weatherIndex],
        lockedCity: context.eventCity,
        hasServiceAccess: true,
      });
    }
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
      this.applyInvitationContext(this.data.invitationContext);
    }).catch(() => {});
  },
  syncApplyFlag() {
    return app.ensureLogin()
      .then(() => app.request('/api/apply/me', 'GET', {}, {}, { silent: true }))
      .then((record) => {
        const checkedIn = !!(record && record.checkedInAt);
        const approved = record && record.status === 'APPROVED';
        const pending = record && record.status === 'PENDING';
        this.setData({
          registrationStatus: checkedIn ? '已入场' : (approved ? '已审核' : (pending ? '审核中' : '未登记')),
          registrationStatusClass: checkedIn ? 'checked-in' : (approved ? 'approved' : (pending ? 'pending' : 'unregistered')),
        });
        if (record && record.phone) {
          wx.setStorageSync('lastApplyPhone', record.phone);
        }
        if (record && record.eventCity) {
          this.setData({ hasServiceAccess: true });
          if (record.invitationCode) wx.setStorageSync('activeInviteCode', record.invitationCode);
          if (!this.data.lockedCity) {
            const context = { eventCity: record.eventCity };
            this.setData({ valid: true, invitationContext: context });
            this.applyInvitationContext(context);
          }
        }
      })
      .catch((err) => {
        if (err && err.code === 3002) {
          wx.removeStorageSync('lastApplyPhone');
          this.setData({ registrationStatus: '未登记', registrationStatusClass: 'unregistered' });
          if (!this.data.valid) this.setData({ hasServiceAccess: false, lockedCity: '' });
        }
      });
  },
  prepareInviteDialog() {
    const hasApplied = wx.getStorageSync('lastApplyPhone');
    if (hasApplied || this.inviteDialogShownInPage) return;
    this.inviteDialogShownInPage = true;
    setTimeout(() => {
      this.setData({ showInviteDialog: true });
    }, 360);
  },
  closeInviteDialog() {
    this.setData({ showInviteDialog: false });
  },
  enterInviteApply() {
    this.setData({ showInviteDialog: false });
    this.goRegister();
  },
  goRegister() {
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
    const memberProfile = wx.getStorageSync('bochuMemberProfile');
    const target = `/pages/apply/index?inviteCode=${encodeURIComponent(this.data.inviteCode || '')}`;
    if (!memberProfile || !memberProfile.name || !memberProfile.gender) {
      wx.navigateTo({ url: `/pages/login/index?redirect=${encodeURIComponent(target)}` });
      return;
    }
    if (wx.getStorageSync('lastApplyPhone')) {
      this.showTicket();
      return;
    }
    wx.navigateTo({ url: target });
  },
  noop() {},
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
    if (!this.data.hasServiceAccess && ['letter', 'agenda', 'route'].includes(key)) {
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
    } else {
      wx.showToast({ title: '敬请期待', icon: 'none' });
    }
  },
  openServicePage(page) {
    const city = this.data.lockedCity || this.data.currentWeather.city || '';
    wx.navigateTo({ url: `/pages/${page}/index?city=${encodeURIComponent(city)}` });
  },
  goLottery() {
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
