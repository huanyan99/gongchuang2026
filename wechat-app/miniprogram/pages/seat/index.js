const app = getApp();

function seatLabel(seatNo) {
  return seatNo ? ` · ${seatNo} 号座` : '';
}

Page({
  data: {
    loading: true,
    eventCity: '',
    published: false,
    tables: [],
    mySeats: [],
    primarySeat: null,
    myTableCount: 0,
    selected: null,
  },
  onLoad(options) {
    this.setData({ eventCity: decodeURIComponent(options.city || '') });
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
    const tables = (data.tables || []).map((item) => Object.assign({}, item, {
      tableNo: String(item.tableNo),
    }));
    const mySeats = (data.mySeats || []).map((item) => Object.assign({}, item, {
      tableNo: String(item.tableNo),
      seatLabel: seatLabel(item.seatNo),
    }));
    const primarySeat = mySeats.length ? mySeats[0] : null;
    const myTable = primarySeat ? tables.find((item) => item.tableNo === primarySeat.tableNo) : null;
    this.setData({
      loading: false,
      eventCity: data.eventCity || this.data.eventCity,
      published: !!data.published,
      tables,
      mySeats,
      primarySeat,
      myTableCount: myTable ? myTable.guestCount : 0,
    });
  },
  selectTable(e) {
    this.setData({ selected: this.data.tables[Number(e.currentTarget.dataset.index)] });
  },
  closeDetail() {
    this.setData({ selected: null });
  },
  noop() {},
});
