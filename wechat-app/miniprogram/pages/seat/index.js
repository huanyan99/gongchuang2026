const app = getApp();

// 全场位置图：把图片放进 /images/ 后填写路径，或填写已配置域名的 https 图片地址。
const HALL_IMAGES = {
  上海: '',
  济南: '',
  佛山: '',
};

Page({
  data: {
    loading: true,
    eventCity: '',
    published: false,
    mySeats: [],
    hallImage: '',
  },
  onLoad(options) {
    const eventCity = decodeURIComponent(options.city || '');
    this.setData({ eventCity, hallImage: HALL_IMAGES[eventCity] || '' });
    if (eventCity === '上海') { this.setData({ loading: false }); return; }
    this.loadSeat();
  },
  onShow() {
    if (!this.data.loading) this.loadSeat();
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
      published: !!data.published,
      mySeats,
      hallImage: HALL_IMAGES[eventCity] || '',
    });
  },
  previewHall() {
    if (!this.data.hallImage) return;
    wx.previewImage({ urls: [this.data.hallImage] });
  },
});
