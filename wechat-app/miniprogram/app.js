App({
  onLaunch() {
    // 登录并缓存 token
    this.login();
  },
  login() {
    if (this.globalData.mockApi) {
      const data = this.mockRequest('/api/auth/login');
      this.globalData.token = data.token;
      this.globalData.userInfo = data.user;
      wx.setStorageSync('token', data.token);
      return;
    }
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
    if (this.globalData.mockApi) {
      return Promise.resolve(this.mockRequest(path, method, data));
    }
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
  mockRequest(path, method = 'GET', data = {}) {
    if (path === '/api/auth/login') {
      return {
        token: 'mock-token',
        user: { nickname: '贵宾用户' },
      };
    }

    if (path === '/api/apply' && method === 'POST') {
      wx.setStorageSync('bochuApplyProfile', {
        name: data.name || '',
        phone: data.phone || '',
        company: data.company || '',
        position: data.position || '',
        reason: data.reason || '',
      });
      wx.setStorageSync('lastApplyPhone', data.phone || '');
      return { status: 'PENDING' };
    }

    if (path.indexOf('/api/apply/check-invitation') === 0) {
      return { valid: true };
    }

    if (path.indexOf('/api/apply/status') === 0) {
      const profile = wx.getStorageSync('bochuApplyProfile') || {};
      if (!profile.phone && !wx.getStorageSync('lastApplyPhone')) return null;
      return {
        name: profile.name || '贵宾',
        phone: profile.phone || wx.getStorageSync('lastApplyPhone'),
        company: profile.company || '',
        position: profile.position || '',
        reason: profile.reason || '',
        status: 'APPROVED',
      };
    }

    if (path.indexOf('/api/admin/applications') === 0) {
      const profile = wx.getStorageSync('bochuApplyProfile') || {};
      return profile.phone ? [{ ...profile, id: 1, status: 'APPROVED' }] : [];
    }

    return {};
  },
  globalData: {
    // 开发时本机调试地址；上线前换成 https 域名并在小程序后台配置
    baseUrl: 'http://localhost:8080',
    mockApi: true,
    token: null,
    userInfo: null,
  },
});
