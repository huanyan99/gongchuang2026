Page({
  data: { city: '', date: '' },
  onLoad(options) {
    const city = decodeURIComponent(options.city || '');
    this.setData({ city, date: { 佛山: '9月18日', 济南: '9月22日', 上海: '10月21日' }[city] || '待通知' });
  },
});
