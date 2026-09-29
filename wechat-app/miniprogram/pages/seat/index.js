const app = getApp();

Page({
  data: {
    loading: true,
    eventCity: '',
    visible: true,
    published: false,
    mySeats: [],
  },
  onLoad(options) {
    const eventCity = decodeURIComponent(options.city || '');
    this.setData({ eventCity });
    this.checkVisible(eventCity);
  },
  onShow() {
    if (!this.data.loading && this.data.visible) this.loadSeat();
  },
  /**
   * 先问后端这个场次是否开放（公开接口，不需要登录）。
   * 未开放就停在「暂未更新~」，与开关上线前的表现一致；查询失败时退回原逻辑。
   */
  checkVisible(eventCity) {
    if (!eventCity) return this.loadSeat();
    return app.request(`/api/seat/visibility?city=${encodeURIComponent(eventCity)}`, 'GET', {}, {}, { silent: true })
      .then((data) => {
        if (data && data.visible) return this.loadSeat();
        this.setData({ loading: false, visible: false });
        return undefined;
      })
      .catch(() => this.loadSeat());
  },
  loadSeat() {
    app.ensureLogin()
      .then(() => app.request('/api/seat/me', 'GET', {}, {}, { silent: true }))
      .then((data) => this.applySeat(data))
      .catch((err) => {
        this.setData({ loading: false });
        wx.showModal({
          title: '暂不可查看',
          content: (err && err.message) || '桌位信息加载失败，请稍后重试',
          showCancel: false,
          success: () => wx.navigateBack(),
        });
      });
  },
  applySeat(data) {
    const mySeats = (data.mySeats || []).map((item) => Object.assign({}, item, {
      tableNo: String(item.tableNo),
    }));
    const eventCity = data.eventCity || this.data.eventCity;
    this.setData({
      loading: false,
      eventCity,
      visible: data.visible !== false,
      published: !!data.published,
      mySeats,
    });
  },
});
