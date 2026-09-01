const app = getApp();

const WEATHER_STOPS = [
  { city: '佛山', date: '18日', temp: '23 ~ 30℃', weather: '小雨', icon: 'rainy', tip: '请备好雨具，预留抵达时间' },
  { city: '济南', date: '22日', temp: '17 ~ 28℃', weather: '多云', icon: 'cloudy', tip: '早晚温差明显，建议携带薄外套' },
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
  },
  onLoad(options) {
    const inviteCode = options.inviteCode || '';
    this.setData({ inviteCode });
    this.loadEventWeather();
    if (inviteCode) {
      app.request(`/api/apply/check-invitation?code=${encodeURIComponent(inviteCode)}`).then(() => {
        this.setData({ valid: true });
      }).catch(() => {
        this.setData({ valid: false });
      });
    }
    this.syncApplyFlag().then(() => this.prepareInviteDialog());
  },
  onShow() {
    this.syncApplyFlag();
  },
  loadEventWeather() {
    app.request('/api/events', 'GET', {}, {}, { silent: true }).then((rows) => {
      if (!Array.isArray(rows) || !rows.length) return;
      const weatherStops = WEATHER_STOPS.map((fallback) => {
        const row = rows.find((item) => String(item.city || '').replace(/场$/, '') === fallback.city);
        if (!row) return fallback;
        const dateParts = String(row.eventDate || '').split('-');
        const day = Number(dateParts[2]);
        const hasWeather = row.tempMin != null && row.tempMax != null && !!row.weatherText;
        return {
          city: fallback.city,
          date: day ? `${day}日` : fallback.date,
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
      })
      .catch((err) => {
        if (err && err.code === 3002) {
          wx.removeStorageSync('lastApplyPhone');
          this.setData({ registrationStatus: '未登记', registrationStatusClass: 'unregistered' });
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
    if (key === 'register') {
      this.goRegister();
    } else if (key === 'lottery') {
      this.goLottery();
    } else {
      wx.showToast({ title: '敬请期待', icon: 'none' });
    }
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
    wx.navigateTo({ url: '/pages/apply/index?ticket=1' });
  },
  goAdmin() {
    wx.navigateTo({ url: '/pages/admin/index' });
  },
  onShareAppMessage() {
    return {
      title: '诚邀您参加共创会',
      path: `/pages/index/index?inviteCode=${encodeURIComponent(this.data.inviteCode || '')}`,
    };
  },
});
