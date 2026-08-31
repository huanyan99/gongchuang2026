const app = getApp();

Page({
  data: {
    inviteCode: '',
    name: '',
    phone: '',
    company: '',
    position: '',
    reason: '',
    submitting: false,
  },
  onLoad(options) {
    const memberProfile = wx.getStorageSync('bochuMemberProfile');
    this.setData({
      inviteCode: options.inviteCode || '',
      name: memberProfile.name || '',
    });
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
      wx.setStorageSync('lastApplyPhone', this.data.phone);
      wx.showModal({
        title: '提交成功',
        content: '您的申报信息已提交，请等待审核',
        showCancel: false,
        success: () => wx.navigateBack(),
      });
    }).finally(() => this.setData({ submitting: false }));
  },
});
