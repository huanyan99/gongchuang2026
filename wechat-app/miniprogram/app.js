App({
  onLaunch() {
    const token = wx.getStorageSync('token');
    if (token) this.globalData.token = token;
    this.ensureLogin().catch(() => {});
  },
  /** 本机设备识别码：首次生成后长期保存，用于「一个账号一台设备」限制 */
  deviceId() {
    let id = wx.getStorageSync('deviceId');
    if (!id) {
      id = `wx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      wx.setStorageSync('deviceId', id);
    }
    return id;
  },
  clearIdentityCache() {
    [
      'token',
      'activeInviteCode',
      'lastApplyPhone',
      'bochuMemberProfile',
      'bochuApplyProfile',
      'bochuLuckyNumber',
      'authUserId',
    ].forEach((key) => wx.removeStorageSync(key));
    this.globalData.token = null;
    this.globalData.userInfo = null;
  },
  applyLoginSession(data) {
    const nextUserId = data && data.user && data.user.id ? String(data.user.id) : '';
    const previousUserId = String(wx.getStorageSync('authUserId') || '');
    if (previousUserId && nextUserId && previousUserId !== nextUserId) {
      this.clearIdentityCache();
    }
    this.globalData.token = data.token;
    this.globalData.userInfo = data.user;
    wx.setStorageSync('token', data.token);
    if (nextUserId) wx.setStorageSync('authUserId', nextUserId);
  },
  ensureLogin() {
    if (this.globalData.mockApi) {
      const data = this.mockRequest('/api/auth/login');
      this.applyLoginSession(data);
      return Promise.resolve(data.token);
    }
    if (this.globalData.token) {
      return Promise.resolve(this.globalData.token);
    }
    const cached = wx.getStorageSync('token');
    if (cached) {
      this.globalData.token = cached;
      return Promise.resolve(cached);
    }
    if (this._loginPromise) return this._loginPromise;
    this._loginPromise = new Promise((resolve, reject) => {
      wx.login({
        success: (res) => {
          if (!res.code) {
            reject({ code: -1, stage: 'wx.login', message: '微信未返回登录凭证，请重新编译后重试' });
            return;
          }
          this.request('/api/auth/login', 'POST', { code: res.code }, {}, { skipRetry: true })
            .then((data) => {
              this.applyLoginSession(data);
              resolve(data.token);
            })
            .catch((err) => reject(Object.assign({}, err, { stage: '后端登录接口' })));
        },
        fail: () => reject({ code: -1, stage: 'wx.login', message: '微信登录凭证获取失败，请确认微信网络及小程序 AppID' }),
      });
    }).finally(() => {
      this._loginPromise = null;
    });
    return this._loginPromise;
  },
  relogin() {
    this.globalData.token = null;
    wx.removeStorageSync('token');
    return this.ensureLogin();
  },
  request(path, method = 'GET', data = {}, extraHeader = {}, options = {}) {
    const silent = !!options.silent;
    const skipRetry = !!options.skipRetry;
    if (this.globalData.mockApi) {
      try {
        return Promise.resolve(this.mockRequest(path, method, data));
      } catch (err) {
        if (!options.silent && (!err || err.code !== 3002)) {
          wx.showToast({ title: (err && err.message) || '请求失败', icon: 'none' });
        }
        return Promise.reject(err);
      }
    }
    return new Promise((resolve, reject) => {
      wx.request({
        url: this.globalData.baseUrl + path,
        method,
        data,
        timeout: 15000,
        header: Object.assign({
          'Content-Type': 'application/json',
          Authorization: this.globalData.token || wx.getStorageSync('token') || '',
          'X-Device-Id': this.deviceId(),
        }, extraHeader),
        success: (res) => {
          const body = res.data;
          if (body && body.code === 0) {
            resolve(body.data);
            return;
          }
          const err = body && typeof body === 'object'
            ? body
            : { code: -1, message: '请求失败' };
          if (err.code === 1001 && !skipRetry && path !== '/api/auth/login') {
            this.relogin()
              .then(() => this.request(path, method, data, extraHeader, Object.assign({}, options, { skipRetry: true })))
              .then(resolve)
              .catch(reject);
            return;
          }
          const skipToast = silent || err.code === 3002;
          if (!skipToast) {
            wx.showToast({ title: err.message || '请求失败', icon: 'none' });
          }
          reject(err);
        },
        fail: (failure) => {
          const detail = (failure && failure.errMsg) || '';
          const message = /domain list|url not in domain/i.test(detail)
            ? '请求域名未获允许，请检查合法域名或本地调试设置'
            : (/timeout/i.test(detail)
              ? '连接后端超时，请检查手机和电脑网络'
              : '无法连接后端，请检查服务地址、网络和防火墙');
          const err = { code: -1, stage: '网络请求', message };
          if (!silent) {
            wx.showToast({ title: err.message, icon: 'none' });
          }
          reject(err);
        },
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
      return true;
    }

    if (path.indexOf('/api/apply/me') === 0 || path.indexOf('/api/apply/status') === 0) {
      const profile = wx.getStorageSync('bochuApplyProfile') || {};
      if (!profile.phone && !wx.getStorageSync('lastApplyPhone')) {
        const err = { code: 3002, message: '未查询到申报记录' };
        throw err;
      }
      return {
        name: profile.name || '贵宾',
        phone: profile.phone || wx.getStorageSync('lastApplyPhone'),
        company: profile.company || '',
        position: profile.position || '',
        reason: profile.reason || '',
        status: 'PENDING',
      };
    }

    if (path.indexOf('/api/apply/ticket') === 0) {
      const profile = wx.getStorageSync('bochuApplyProfile') || {};
      return {
        status: 'PENDING',
        name: profile.name || '贵宾',
        phone: profile.phone || wx.getStorageSync('lastApplyPhone'),
        ticketNo: 'BOCHU-0000',
        checkedIn: false,
        expireSeconds: 120,
      };
    }

    if (path === '/api/lottery/draw' && method === 'POST') {
      let luckyCode = wx.getStorageSync('bochuLuckyNumber');
      if (!luckyCode) {
        luckyCode = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
        wx.setStorageSync('bochuLuckyNumber', luckyCode);
      }
      return { luckyCode, newlyDrawn: true };
    }

    if (path === '/api/lottery/me') {
      const luckyCode = wx.getStorageSync('bochuLuckyNumber');
      if (!luckyCode) throw { code: 4001, message: '尚未抽取号码' };
      return { luckyCode, newlyDrawn: false };
    }

    if (path.indexOf('/api/admin/checkin') === 0) {
      return { name: '贵宾', status: 'APPROVED' };
    }

    if (path.indexOf('/api/admin/applications') === 0) {
      if (method === 'POST') {
        return { id: 1, status: data.status, reviewRemark: data.remark || '' };
      }
      const profile = wx.getStorageSync('bochuApplyProfile') || {};
      const records = profile.phone
        ? [Object.assign({}, profile, { id: 1, status: 'PENDING' })]
        : [];
      return { records, total: records.length, page: 1, size: 20, pages: 1 };
    }

    return {};
  },
  globalData: {
    // 本机局域网联调地址；正式发布前必须替换为已配置的 HTTPS API 域名。
    baseUrl: 'http://10.1.101.250:8080',
    mockApi: false,
    token: null,
    userInfo: null,
  },
});
