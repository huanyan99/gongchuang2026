App({
  onLaunch() {
    // 登录并缓存 token
    this.login();
  },
  login() {
    wx.login({
      success: (res) => {
        if (!res.code) return;
        this.request('/api/auth/login', 'POST', { code: res.code }).then((data) => {
          this.globalData.token = data.token;
          this.globalData.userInfo = data.user;
          wx.setStorageSync('token', data.token);
        });
      },
    });
  },
  // 统一请求封装；extraHeader 可选，用于管理端密钥等
  request(path, method = 'GET', data = {}, extraHeader = {}) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: this.globalData.baseUrl + path,
        method,
        data,
        header: {
          'Content-Type': 'application/json',
          Authorization: this.globalData.token || wx.getStorageSync('token') || '',
          ...extraHeader,
        },
        success: (res) => {
          if (res.data && res.data.code === 0) {
            resolve(res.data.data);
          } else {
            wx.showToast({ title: (res.data && res.data.message) || '请求失败', icon: 'none' });
            reject(res.data);
          }
        },
        fail: reject,
      });
    });
  },
  globalData: {
    // 开发时本机调试地址；上线前换成 https 域名并在小程序后台配置
    baseUrl: 'http://localhost:8080',
    token: null,
    userInfo: null,
  },
});
