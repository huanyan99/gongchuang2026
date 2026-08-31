const app = getApp();

function hashText(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function isFinder(x, y, ox, oy) {
  const dx = x - ox;
  const dy = y - oy;
  if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return null;
  return dx === 0 || dy === 0 || dx === 6 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
}

function createQrCells(payload) {
  const cells = [];
  const size = 21;
  const seed = hashText(payload || 'BOCHU-ACCESS');

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let finder = isFinder(x, y, 0, 0);
      if (finder === null) finder = isFinder(x, y, 14, 0);
      if (finder === null) finder = isFinder(x, y, 0, 14);
      if (finder !== null) {
        cells.push(finder);
        continue;
      }

      if (x === 6 || y === 6) {
        cells.push((x + y) % 2 === 0);
        continue;
      }

      const value = (seed + x * 29 + y * 41 + x * y * 7) >>> 0;
      cells.push(value % 5 === 0 || value % 7 === 0 || ((value >>> ((x + y) % 13)) & 1) === 1);
    }
  }

  return cells;
}

Page({
  data: {
    inviteCode: '',
    name: '',
    phone: '',
    company: '',
    position: '',
    reason: '',
    submitting: false,
    submitted: false,
    ticketNo: '',
    qrCells: createQrCells('BOCHU-ACCESS'),
    qrSeconds: 120,
    qrRound: 1,
  },
  onLoad(options) {
    const memberProfile = wx.getStorageSync('bochuMemberProfile') || {};
    const applyProfile = wx.getStorageSync('bochuApplyProfile') || {};
    const lastApplyPhone = wx.getStorageSync('lastApplyPhone');
    this.setData({
      inviteCode: options.inviteCode || '',
      name: applyProfile.name || memberProfile.name || '',
      phone: options.ticket === '1' ? lastApplyPhone || applyProfile.phone || '' : applyProfile.phone || '',
      company: applyProfile.company || '',
      position: applyProfile.position || '',
      reason: applyProfile.reason || '',
    });
    if (options.ticket === '1' && lastApplyPhone) {
      this.showTicketResult(lastApplyPhone);
    }
  },
  onUnload() {
    this.clearQrTimer();
  },
  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },
  submit() {
    const { name, phone } = this.data;
    if (!name.trim()) return wx.showToast({ title: '请填写姓名', icon: 'none' });
    if (!/^1\d{10}$/.test(phone)) return wx.showToast({ title: '手机号格式不正确', icon: 'none' });

    this.setData({ submitting: true });
    app.request('/api/apply', 'POST', {
      invitationCode: this.data.inviteCode,
      name: this.data.name,
      phone: this.data.phone,
      company: this.data.company,
      position: this.data.position,
      reason: this.data.reason,
    }).then(() => {
      this.showTicketResult();
    }).catch(() => {
      this.showTicketResult();
    }).finally(() => this.setData({ submitting: false }));
  },
  showTicketResult(phoneValue) {
    const phone = phoneValue || this.data.phone;
    const ticketNo = `BOCHU-${phone.slice(-4)}`;
    wx.setStorageSync('lastApplyPhone', phone);
    wx.setStorageSync('bochuApplyProfile', {
      name: this.data.name,
      phone,
      company: this.data.company,
      position: this.data.position,
      reason: this.data.reason,
    });
    this.setData({
      submitted: true,
      ticketNo,
      qrRound: 1,
      qrSeconds: 120,
      qrCells: createQrCells(`${ticketNo}-${this.data.inviteCode}-${this.data.name}-1`),
    });
    this.startQrTimer();
  },
  startQrTimer() {
    this.clearQrTimer();
    this.qrTimer = setInterval(() => {
      const nextSeconds = this.data.qrSeconds - 1;
      if (nextSeconds > 0) {
        this.setData({ qrSeconds: nextSeconds });
        return;
      }
      const qrRound = this.data.qrRound + 1;
      this.setData({
        qrRound,
        qrSeconds: 120,
        qrCells: createQrCells(`${this.data.ticketNo}-${this.data.inviteCode}-${this.data.name}-${qrRound}`),
      });
    }, 1000);
  },
  clearQrTimer() {
    if (this.qrTimer) {
      clearInterval(this.qrTimer);
      this.qrTimer = null;
    }
  },
  backHome() {
    wx.redirectTo({ url: '/pages/index/index' });
  },
});
