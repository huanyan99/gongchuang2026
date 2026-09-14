// 各场次会场与交通信息；上海场待会务确认后补充。
const VENUES = {
  佛山: {
    hotel: '佛山万豪酒店',
    address: '广东省佛山市南海区桂城街道海八东路38号',
    hall: '五楼千灯湖厅',
    distances: [
      { name: '佛山火车西站', detail: '约 15 公里 · 车程约 30 分钟' },
      { name: '广州火车南站', detail: '约 25 公里 · 车程约 35 分钟' },
      { name: '佛山沙堤机场', detail: '约 9 公里 · 车程约 20 分钟' },
      { name: '广州白云国际机场', detail: '约 48 公里 · 车程约 50 分钟' },
    ],
    services: [],
    around: [],
  },
  济南: {
    hotel: '济南君廷酒店',
    address: '山东省济南市历下区坤顺路606号C塔101',
    hall: '2 楼宴会厅',
    distances: [
      { name: '济南体育中心体育场', detail: '约 1.3 公里 · 车程约 6 分钟' },
      { name: '济南东站', detail: '约 10 公里 · 车程约 15 分钟' },
      { name: '济南西站', detail: '约 20 公里 · 车程约 40 分钟' },
      { name: '济南遥墙机场', detail: '约 23 公里 · 车程约 40 分钟' },
    ],
    services: [
      { name: '塞纳宫餐厅 · 1 楼', detail: '早餐 工作日 6:30-9:30，周末及节假日 6:30-10:00；午餐 11:30-14:00；晚餐 17:30-21:00' },
      { name: '御粟轩中餐厅', detail: '桌餐可签单；午餐 11:30-14:30，晚餐 17:30-22:00' },
      { name: '大堂酒廊 · 1 楼', detail: '10:00-23:00；客房 24 小时点餐' },
      { name: '酒店 WiFi', detail: '团队密码 84569999；或账号填房间号、密码填客人姓氏' },
      { name: '洗衣服务', detail: '8:30-17:00 收件，11:00 之后收取的次日送回' },
      { name: '外卖与快递', detail: '一楼礼宾部代收' },
      { name: '健身房 · B1', detail: '在住客人 24 小时开放，需携带房卡' },
      { name: '游泳池 · B1', detail: '室内恒温泳池，07:00-22:00' },
    ],
    around: [
      { name: '万象城 / 龙湖天街', detail: '约 1 公里 · 车程约 5 分钟' },
      { name: '便利店', detail: '酒店北门对面，步行约 2 分钟' },
      { name: '咖啡店', detail: '约 1 公里 · 车程约 5 分钟' },
    ],
  },
};

Page({
  data: { city: '', venue: null },
  onLoad(options) {
    const city = decodeURIComponent(options.city || '');
    this.setData({ city, venue: VENUES[city] || null });
  },
  copyAddress() {
    const venue = this.data.venue;
    const text = venue
      ? `${venue.hotel}\n${venue.address}\n${venue.hall}`
      : `${this.data.city}场会场地址（待会务确认）`;
    wx.setClipboardData({ data: text });
  },
});
