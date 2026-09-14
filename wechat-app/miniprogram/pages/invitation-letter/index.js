Page({
  data: { city: '', available: false, poster: '' },
  onLoad(options) {
    const city = decodeURIComponent(options.city || '');
    const posters = { 佛山: '/images/foshan-invent.jpg', 济南: '/images/jinan-invent.jpg' };
    this.setData({ city, available: !!posters[city], poster: posters[city] || '' });
  },
});
