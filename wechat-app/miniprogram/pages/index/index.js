const app = getApp();

const WEATHER_STOPS = [
  { city: '佛山', date: '9月18日', temp: '30°C', weather: '多云', icon: 'cloudy', tip: '建议轻装出行并预留抵达时间' },
  { city: '济南', date: '9月22日', temp: '24°C', weather: '晴', icon: 'sunny', tip: '建议提前出发并预留签到时间' },
  { city: '上海', date: '10月10日', temp: '25°C', weather: '有雨', icon: 'rainy', tip: '建议备好雨具并预留抵达时间' },
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
  },
  onLoad(options) {
    const inviteCode = options.inviteCode || '';
    this.setData({ inviteCode });
    this.prepareInviteDialog();
    if (inviteCode) {
      app.request(`/api/apply/check-invitation?code=${inviteCode}`).then(() => {
        this.setData({ valid: true });
      }).catch(() => {
        this.setData({ valid: false });
      });
    }
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
    const memberProfile = wx.getStorageSync('bochuMemberProfile');
    const target = `/pages/apply/index?inviteCode=${this.data.inviteCode || ''}`;
    if (!memberProfile || !memberProfile.name || !memberProfile.gender) {
      wx.navigateTo({ url: `/pages/login/index?redirect=${encodeURIComponent(target)}` });
      return;
    }
    wx.navigateTo({ url: target });
  },
  noop() {},
  onHomeTap() {
    wx.pageScrollTo({ scrollTop: 0, duration: 260 });
  },
  switchWeather(e) {
    const weatherIndex = Number(e.currentTarget.dataset.index);
    this.setData({
      weatherIndex,
      currentWeather: WEATHER_STOPS[weatherIndex],
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
    } else if (key === 'ticket') {
      this.showTicket();
    } else {
      wx.showToast({ title: '敬请期待', icon: 'none' });
    }
  },
  // 入场码：查询自己的审核状态
  showTicket() {
    const phone = wx.getStorageSync('lastApplyPhone');
    if (!phone) {
      wx.showModal({
        title: '还未申报',
        content: '请先填写参会登记，审核通过后即可获取入场资格',
        confirmText: '去登记',
        success: (res) => {
          if (res.confirm) {
            this.goRegister();
          }
        },
      });
      return;
    }
    app.request(`/api/apply/status?phone=${phone}`).then((data) => {
      if (!data) {
        wx.showModal({ title: '未找到记录', content: '未查询到申报记录', showCancel: false });
        return;
      }
      const map = { PENDING: '审核中，请耐心等待', APPROVED: '已通过，凭报名手机号入场', REJECTED: `已驳回${data.reviewRemark ? '：' + data.reviewRemark : ''}` };
      wx.showModal({
        title: data.status === 'APPROVED' ? '入场资格 ✓' : '入场状态',
        content: `${data.name}：${map[data.status]}`,
        showCancel: false,
      });
    });
  },
  goAdmin() {
    wx.navigateTo({ url: '/pages/admin/index' });
  },
  onShareAppMessage() {
    return {
      title: '诚邀您参加共创会',
      path: `/pages/index/index?inviteCode=${this.data.inviteCode || ''}`,
    };
  },
});
