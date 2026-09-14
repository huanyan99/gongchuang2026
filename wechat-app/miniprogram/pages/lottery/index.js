const app = getApp();

Page({
  data: {
    running: false,
    requesting: true,
    drawn: false,
    preparedNumber: '',
    rollingDigits: ['—', '—', '—', '—'],
    finalNumber: '',
    activeReels: [false, false, false, false],
    lockedReels: [false, false, false, false],
    buttonPressed: false,
    reveal: false,
    focusNumber: false,
    showResultText: false,
  },
  onLoad() {
    wx.removeStorageSync('bochuLuckyNumber');
    app.ensureLogin()
      .then(() => app.request('/api/lottery/me', 'GET', {}, {}, { silent: true }))
      .then((result) => this.prepareCode(result.luckyCode))
      .catch((err) => {
        if (!err || err.code !== 4001) {
          wx.showToast({ title: (err && err.message) || '抽奖信息加载失败', icon: 'none' });
        }
      })
      .finally(() => this.setData({ requesting: false }));
  },
  onUnload() {
    this.clearAnimationTimers();
  },
  startDraw() {
    if (this.data.running || this.data.requesting) return;
    if (this.data.drawn) {
      wx.showToast({ title: '您的号码已抽取', icon: 'none' });
      return;
    }

    if (!this.data.preparedNumber) {
      wx.showToast({ title: '抽奖码尚未加载，请稍后重试', icon: 'none' });
      return;
    }
    this.setData({ buttonPressed: true });
    this.beginDraw(this.data.preparedNumber);
  },
  prepareCode(luckyCode) {
    const finalNumber = String(luckyCode || '').padStart(4, '0').slice(-4);
    if (!/^\d{4}$/.test(finalNumber)) return;
    this.setData({ preparedNumber: finalNumber });
  },
  beginDraw(luckyCode) {
    const finalNumber = String(luckyCode || '').padStart(4, '0').slice(-4);
    if (!/^\d{4}$/.test(finalNumber)) {
      wx.showToast({ title: '抽奖码格式异常', icon: 'none' });
      return;
    }
    this.finalDigits = finalNumber.split('');
    this.setData({
      running: true,
      buttonPressed: true,
      rollingDigits: this.randomDigits(),
      activeReels: [false, false, false, false],
      lockedReels: [false, false, false, false],
      showResultText: false,
    });
    wx.vibrateShort({ type: 'light' });

    this.schedule(() => this.setData({ buttonPressed: false }), 280);
    [150, 300, 450, 600].forEach((delay, index) => {
      this.schedule(() => this.activateReel(index), delay);
    });

    this.rollingTimer = setInterval(() => this.advanceReels(), 56);
    [2400, 2900, 3400, 3900].forEach((lockAt, index) => {
      this.schedule(() => this.overshootReel(index), lockAt - 110);
      this.schedule(() => this.lockReel(index), lockAt);
    });

    this.schedule(() => this.finishDraw(finalNumber), 3900);
  },
  activateReel(index) {
    const activeReels = this.data.activeReels.slice();
    activeReels[index] = true;
    this.setData({ activeReels });
  },
  advanceReels() {
    const rollingDigits = this.data.rollingDigits.slice();
    this.data.activeReels.forEach((active, index) => {
      if (active && !this.data.lockedReels[index]) {
        rollingDigits[index] = String(Math.floor(Math.random() * 10));
      }
    });
    this.setData({ rollingDigits });
  },
  overshootReel(index) {
    const rollingDigits = this.data.rollingDigits.slice();
    rollingDigits[index] = String((Number(this.finalDigits[index]) + 1) % 10);
    this.setData({ rollingDigits });
  },
  lockReel(index) {
    const rollingDigits = this.data.rollingDigits.slice();
    const lockedReels = this.data.lockedReels.slice();
    rollingDigits[index] = this.finalDigits[index];
    lockedReels[index] = true;
    this.setData({ rollingDigits, lockedReels });
    wx.vibrateShort({ type: 'light' });
  },
  finishDraw(finalNumber) {
    this.clearRollingTimer();
    this.setData({ drawn: true, finalNumber });
    this.schedule(() => this.setData({ reveal: true }), 300);
    this.schedule(() => this.setData({ focusNumber: true }), 450);
    this.schedule(() => this.setData({ showResultText: true, running: false }), 900);
    this.schedule(() => this.setData({ reveal: false }), 1800);
    wx.vibrateShort({ type: 'medium' });
  },
  randomNumber() {
    return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  },
  randomDigits() {
    return this.randomNumber().split('');
  },
  clearRollingTimer() {
    if (this.rollingTimer) {
      clearTimeout(this.rollingTimer);
      this.rollingTimer = null;
    }
  },
  schedule(callback, delay) {
    if (!this.animationTimers) this.animationTimers = [];
    const timer = setTimeout(callback, delay);
    this.animationTimers.push(timer);
  },
  clearAnimationTimers() {
    this.clearRollingTimer();
    (this.animationTimers || []).forEach((timer) => clearTimeout(timer));
    this.animationTimers = [];
  },
  openRules() {
    wx.navigateTo({ url: '/pages/lottery-rules/index' });
  },
});
