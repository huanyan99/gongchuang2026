/** 首页，对应 wechat-app/miniprogram/pages/index/index.js */

import { View } from '../core/view.js';
import { html, when, cx } from '../core/dom.js';
import { request, ensureLogin, config } from '../core/api.js';
import { getStorage, setStorage, removeStorage } from '../core/storage.js';
import { showModal, toast } from '../core/ui.js';

const WEATHER_STOPS = [
  { city: '佛山', date: '9月18日', temp: '23 ~ 30℃', weather: '小雨', icon: 'rainy', tip: '请备好雨具，预留抵达时间' },
  { city: '济南', date: '9月22日', temp: '17 ~ 28℃', weather: '多云', icon: 'cloudy', tip: '早晚温差明显，建议携带薄外套' },
  { city: '上海', date: '10月21日', temp: '----', weather: '', icon: 'cloudy', tip: '临近活动日期将自动更新天气' },
];

const SERVICE_KEYS = ['letter', 'agenda', 'route', 'seat'];
const SERVICE_ROUTES = { letter: 'invitation-letter', agenda: 'agenda', route: 'route', seat: 'seat' };

export class HomeView extends View {
  static meta = { title: '共创会', background: '#ffffff', textStyle: 'black' };

  constructor(options) {
    super(options);
    this.data = {
      inviteCode: '',
      valid: null,
      weatherIndex: 0,
      weatherStops: WEATHER_STOPS,
      currentWeather: WEATHER_STOPS[0],
      homeBannerUrl: 'assets/banner.jpg',
      registrationStatus: '未登记',
      registrationStatusClass: 'unregistered',
      lotteryEligible: false,
      showPrivacyConsent: false,
      privacyChecked: false,
      invitationContext: null,
      canManageInvitations: false,
      lockedCity: '',
      hasServiceAccess: false,
      hasRegistrationRecord: false,
      registrationEventCity: '',
      invitationCanOverride: false,
      authed: false,
    };
  }

  onLoad(options) {
    // 隐私弹窗当前关闭（config.privacyPopup），协议入口保留在个人中心底部
    const privacyAccepted = !!getStorage('bochuPrivacyAccepted');
    this.setData({ showPrivacyConsent: !!config.privacyPopup && !privacyAccepted });

    // 邀请码只能来自本次打开参数；旧缓存不能自行恢复受邀场次。
    const inviteCode = options.code || options.inviteCode || '';
    this.launchInviteCode = inviteCode;
    this.setData({ inviteCode });
    if (!inviteCode) removeStorage('activeInviteCode');

    this.loadEventWeather();
    // 必须先查询数据库登记；只有明确未登记时，当前邀请链接才有权锁定场次。
    this.syncApplyFlag()
      .then((record) => {
        if ((!record || record.status === 'REJECTED') && inviteCode) return this.validateInvitation(inviteCode);
        return null;
      })
      .catch(() => {});
  }

  onShow() {
    this.syncApplyFlag().catch(() => {});
    this.loadInvitationPermission();
  }

  /* ---------- 数据 ---------- */

  loadInvitationPermission() {
    return ensureLogin()
      .then(() => request('/api/invitations/permissions', 'GET', {}, {}, { silent: true }))
      .then((permission) => this.setData({
        canManageInvitations: !!(permission && (permission.canInvite || permission.canReview)),
      }))
      .catch(() => this.setData({ canManageInvitations: false }));
  }

  /**
   * 会场归属，按优先级取：
   * 1. 已审核登记的场次
   * 2. 未审核登记 / 有效邀请码的场次
   * 3. 都没有：不锁定场次，参会服务不可用
   * 有归属才锁定城市标签并开放参会服务，避免 syncApplyFlag 与邀请码校验互相覆盖。
   */
  applyVenue() {
    const registered = this.data.registrationEventCity || '';
    const invited = this.data.valid === true && this.data.invitationContext
      ? (this.data.invitationContext.eventCity || '')
      : '';
    const lockedCity = registered || invited;
    const patch = { lockedCity, hasServiceAccess: !!lockedCity };

    const weatherIndex = this.data.weatherStops.findIndex((item) => item.city === lockedCity);
    if (weatherIndex >= 0) {
      patch.weatherIndex = weatherIndex;
      patch.currentWeather = this.data.weatherStops[weatherIndex];
    }
    this.setData(patch);
  }

  validateInvitation(inviteCode) {
    return request(`/api/apply/check-invitation?code=${encodeURIComponent(inviteCode)}`)
      .then((context) => {
        // 查询邀请期间若登记状态发生变化，仍以数据库登记为最高优先级。
        if (this.data.hasRegistrationRecord && !this.data.invitationCanOverride) return;
        setStorage('activeInviteCode', inviteCode);
        this.setData({ inviteCode, valid: true, invitationContext: context || {} });
        this.applyVenue();
      })
      .catch(() => {
        if (this.data.hasRegistrationRecord && !this.data.invitationCanOverride) return;
        removeStorage('activeInviteCode');
        this.setData({ valid: false, invitationContext: null });
        if (this.data.hasRegistrationRecord && this.databaseInvitationContext) {
          this.setData({
            inviteCode: this.databaseInviteCode || '',
            valid: true,
            invitationContext: this.databaseInvitationContext,
          });
        }
        this.applyVenue();
      });
  }

  loadEventWeather() {
    return request('/api/events', 'GET', {}, {}, { silent: true }).then((rows) => {
      if (!Array.isArray(rows) || !rows.length) return;
      const weatherStops = WEATHER_STOPS.map((fallback) => {
        const row = rows.find((item) => String(item.city || '').replace(/场$/, '') === fallback.city);
        if (!row) return fallback;
        const dateParts = String(row.eventDate || '').split('-');
        const month = Number(dateParts[1]);
        const day = Number(dateParts[2]);
        const hasWeather = row.tempMin != null && row.tempMax != null && !!row.weatherText;
        return {
          city: fallback.city,
          date: month && day ? `${month}月${day}日` : fallback.date,
          temp: hasWeather ? `${row.tempMin} ~ ${row.tempMax}℃` : fallback.temp,
          weather: hasWeather ? row.weatherText : fallback.weather,
          icon: hasWeather ? (row.icon || fallback.icon) : fallback.icon,
          tip: hasWeather ? (row.tip || fallback.tip) : fallback.tip,
        };
      });
      const weatherIndex = Math.min(this.data.weatherIndex, weatherStops.length - 1);
      this.setData({ weatherStops, weatherIndex, currentWeather: weatherStops[weatherIndex] });
      this.applyVenue();
    }).catch(() => {});
  }

  syncApplyFlag() {
    return ensureLogin()
      .then(() => {
        this.assign({ authed: true });
        return request('/api/apply/me', 'GET', {}, {}, { silent: true });
      })
      .then((record) => {
        const checkedIn = !!(record && record.checkedInAt);
        const approved = record && record.status === 'APPROVED';
        const pending = record && record.status === 'PENDING';
        const rejected = record && record.status === 'REJECTED';
        this.setData({
          registrationStatus: checkedIn ? '已入场' : (approved ? '已审核' : (pending ? '审核中' : '未登记')),
          registrationStatusClass: checkedIn ? 'checked-in' : (approved ? 'approved' : (pending ? 'pending' : 'unregistered')),
          lotteryEligible: !!approved,
          hasRegistrationRecord: !!record,
          registrationEventCity: (record && record.eventCity) || '',
          invitationCanOverride: !!rejected,
        });
        if (record && record.phone) setStorage('lastApplyPhone', record.phone);
        if (record && record.eventCity) {
          const context = { eventCity: record.eventCity };
          this.databaseInvitationContext = context;
          this.databaseInviteCode = record.invitationCode || '';
          const waitingForRejectedInvite = rejected && !!this.launchInviteCode;
          if (!waitingForRejectedInvite) {
            if (record.invitationCode) setStorage('activeInviteCode', record.invitationCode);
            else removeStorage('activeInviteCode');
            this.setData({ inviteCode: record.invitationCode || '', valid: true, invitationContext: context });
          }
        }
        this.applyVenue();
        return record;
      })
      .catch((err) => {
        // 未登录：首页不展示任何个人状态，点击功能入口再引导去登录
        if (err && err.code === 1001) {
          this.setData({
            authed: false,
            registrationStatus: '未登记',
            registrationStatusClass: 'unregistered',
            lotteryEligible: false,
            hasRegistrationRecord: false,
            registrationEventCity: '',
            canManageInvitations: false,
            valid: null,
            invitationContext: null,
          });
          this.applyVenue();
          return null;
        }
        if (err && err.code === 3002) {
          removeStorage('lastApplyPhone');
          this.setData({
            registrationStatus: '未登记',
            registrationStatusClass: 'unregistered',
            lotteryEligible: false,
            hasRegistrationRecord: false,
            registrationEventCity: '',
            invitationCanOverride: false,
          });
          this.applyVenue();
          return null;
        }
        return Promise.reject(err);
      });
  }

  /* ---------- 交互 ---------- */

  switchWeather(event, dataset) {
    const weatherIndex = Number(dataset.index);
    const target = this.data.weatherStops[weatherIndex];
    if (this.data.lockedCity && target && target.city !== this.data.lockedCity) return;
    this.setData({ weatherIndex, currentWeather: target });
  }

  onMenu(event, dataset) {
    const key = dataset.key;
    if (!this.data.authed) {
      this.router.navigateTo('/login');
      return;
    }
    if (!this.data.hasServiceAccess && SERVICE_KEYS.includes(key)) {
      showModal({ title: '提示', content: '您好，无法查看', showCancel: false });
      return;
    }
    if (key === 'register') this.goRegister();
    else if (key === 'lottery') this.goLottery();
    else if (key === 'invitations') this.router.navigateTo('/invitations');
    else if (SERVICE_ROUTES[key]) this.openServicePage(SERVICE_ROUTES[key]);
  }

  openServicePage(page) {
    const city = this.data.lockedCity || this.data.currentWeather.city || '';
    this.router.navigateTo(`/${page}?city=${encodeURIComponent(city)}`);
  }

  goRegister() {
    if (this.data.hasRegistrationRecord) {
      this.router.navigateTo(`/apply?record=1&inviteCode=${encodeURIComponent(this.data.inviteCode || '')}`);
      return;
    }
    if (!this.data.inviteCode) {
      showModal({
        title: '定向邀请活动',
        content: '本次活动采用定向邀请制，请通过主办方发送的专属邀请进入。',
        showCancel: false,
      });
      return;
    }
    if (this.data.valid === false) {
      toast('邀请码无效或已达上限');
      return;
    }
    if (this.data.valid !== true) {
      toast('正在校验邀请码');
      return;
    }
    this.router.navigateTo(`/apply?inviteCode=${encodeURIComponent(this.data.inviteCode)}`);
  }

  goLottery() {
    if (!this.data.authed) {
      this.router.navigateTo('/login');
      return;
    }
    if (!this.data.lotteryEligible) {
      showModal({
        title: '暂不可领取',
        content: this.data.registrationStatus === '审核中'
          ? '您的参会登记正在审核中，审核通过后可领取抽奖码。'
          : '请先完成参会登记并等待审核通过，之后即可领取抽奖码。',
        showCancel: false,
      });
      return;
    }
    this.router.navigateTo('/lottery');
  }

  goProfile() {
    this.router.navigateTo('/login');
  }

  onHomeTap() {
    const scroller = this.$('.page-scroll');
    if (scroller) scroller.scrollTo({ top: 0, behavior: 'smooth' });
  }

  togglePrivacyConsent() {
    this.setData({ privacyChecked: !this.data.privacyChecked });
  }

  confirmPrivacyConsent() {
    if (!this.data.privacyChecked) {
      toast('请先阅读并勾选同意');
      return;
    }
    setStorage('bochuPrivacyAccepted', { version: '2026-09-01', acceptedAt: Date.now() });
    this.setData({ showPrivacyConsent: false });
  }

  openAgreement() {
    this.router.navigateTo('/agreement');
  }

  openPrivacy() {
    this.router.navigateTo('/privacy');
  }

  openLotteryRules() {
    this.router.navigateTo('/lottery-rules');
  }

  /* ---------- 视图 ---------- */

  template() {
    const { currentWeather: weather } = this.data;

    return html`
      <div class="page-scroll">
        <div class="page">
          <div class="hero-scene">
            <img class="hero-bg" src="${this.data.homeBannerUrl}" alt="" />
            <div class="weather-badge">
              <div class="weather-icon ${weather.icon}">
                <div class="sun-core"></div>
                <div class="cloud-main"></div>
                <div class="rain-line one"></div>
                <div class="rain-line two"></div>
              </div>
              <div class="weather-temp">${weather.temp}</div>
              <div class="weather-desc">${weather.weather}</div>
            </div>

            <div class="hero-copy">
              <div class="kicker">BOCHU WELCOME</div>
              <div class="hero-title">共创会</div>
              <div class="hero-rule"></div>
              <div class="hero-sub">柏楚2026价值共创峰会</div>
              ${when(this.data.valid === false, html`<div class="code-invalid">邀请码无效或已达使用上限</div>`)}
            </div>
          </div>

          <div class="summit-panel">
            <div class="city-tabs">
              ${this.data.weatherStops.map((item, index) => html`
                <div
                  class="weather-tab tap ${cx({
                    active: this.data.weatherIndex === index,
                    disabled: this.data.lockedCity && this.data.lockedCity !== item.city,
                  })}"
                  data-index="${index}"
                  data-tap="switchWeather"
                ><span>${item.city}</span></div>
              `)}
            </div>

            <div class="weather-line">
              <span class="weather-pin"></span>
              <span>共创会当日行程</span>
              <span class="weather-sep">·</span>
              <span>${weather.city}</span>
              <span class="weather-sep">·</span>
              <span>${weather.weather} ${weather.temp}</span>
              <span class="weather-sep">·</span>
              <span>${weather.tip}</span>
            </div>

            <div class="event-panel">
              <div class="event-cell">
                <span class="cell-label">DATE</span>
                <span class="cell-value">${weather.date}</span>
              </div>
              <div class="event-cell">
                <span class="cell-label">VENUE</span>
                <span class="cell-value">${weather.city}</span>
              </div>
              <div class="event-cell status-cell">
                <span class="cell-label">登记状态</span>
                <span class="cell-value status-value ${this.data.registrationStatusClass}">${this.data.registrationStatus}</span>
              </div>
            </div>

            ${when(this.data.lotteryEligible && this.data.registrationEventCity, () => html`
              <div class="directed-invite">
                <div class="invite-emblem">贵宾</div>
                <div class="invite-venue-copy">
                  <span>EXCLUSIVE INVITATION</span>
                  <span>受邀场次 · ${this.data.registrationEventCity}场</span>
                </div>
                <div class="invite-gem"></div>
              </div>
            `)}
          </div>

          <div class="feature-grid">
            <div class="feature primary tap" data-key="register" data-tap="onMenu">
              <span class="feature-no">01</span>
              <span class="feature-name">参会登记</span>
              <span class="feature-meta">APPLICATION</span>
            </div>
            <div class="feature lottery-feature tap" data-key="lottery" data-tap="onMenu">
              <span class="feature-no">02</span>
              <span class="feature-name">抽奖码</span>
              <span class="feature-meta">LUCKY DRAW</span>
            </div>
          </div>

          <div class="invitation-manager seat-entry tap" data-key="seat" data-tap="onMenu">
            <span class="feature-no">03</span>
            <div class="manager-copy">
              <span class="feature-name">桌位图</span>
              <span class="feature-meta">SEATING MAP</span>
            </div>
            <span class="arrow">›</span>
          </div>

          ${when(this.data.canManageInvitations, html`
            <div class="invitation-manager tap" data-key="invitations" data-tap="onMenu">
              <div class="manager-copy">
                <span class="feature-name">我的邀请</span>
                <span class="feature-meta">INVITATION MANAGEMENT</span>
              </div>
              <span class="arrow">›</span>
            </div>
          `)}

          <div class="section ${cx({ 'service-locked': !this.data.hasServiceAccess })}">
            <div class="section-head">
              <span>参会服务</span>
              <span>SERVICES</span>
            </div>
            <div class="menu-row tap" data-key="letter" data-tap="onMenu">
              <span class="no">04</span>
              <span class="menu-name">电子邀请函</span>
              <span class="arrow">›</span>
            </div>
            <div class="menu-row tap" data-key="agenda" data-tap="onMenu">
              <span class="no">05</span>
              <span class="menu-name">大会议程</span>
              <span class="arrow">›</span>
            </div>
            <div class="menu-row tap" data-key="route" data-tap="onMenu">
              <span class="no">06</span>
              <span class="menu-name">交通路线</span>
              <span class="arrow">›</span>
            </div>
          </div>
        </div>
      </div>

      <nav class="bottom-nav">
        <div class="nav-item active tap" data-tap="onHomeTap">
          <div class="nav-icon home-icon"><div></div></div>
          <div class="nav-text">共创会</div>
        </div>
        <div class="nav-center tap" data-tap="goLottery">
          <div class="qr-circle lottery-circle">
            <div class="lottery-mark">LUCKY</div>
            <div class="lottery-mark-cn">抽奖码</div>
          </div>
        </div>
        <div class="nav-item tap" data-tap="goProfile">
          <div class="nav-icon user-icon"><div></div></div>
          <div class="nav-text">个人中心</div>
        </div>
      </nav>

      ${when(this.data.showPrivacyConsent, () => html`
        <div class="invite-mask privacy-consent-mask">
          <div class="invite-card privacy-invite-card">
            <div class="invite-corner left">
              <div class="ribbon-fold"></div><div class="ribbon-thread"></div><div class="ribbon-mark">B</div>
            </div>
            <div class="invite-corner right">
              <div class="ribbon-fold"></div><div class="ribbon-thread"></div><div class="ribbon-mark">C</div>
            </div>
            <div class="invite-inner privacy-invite-inner">
              <div class="invite-eyebrow">PRIVACY NOTICE</div>
              <div class="invite-title">尊敬的贵宾</div>
              <div class="privacy-subtitle">用户协议与个人信息保护提示</div>
              <div class="invite-rule"></div>
              <div class="privacy-copy">为提供邀请函、参会登记及抽奖码服务，我们需要处理您主动提交的个人信息。请阅读相关协议后自主选择是否同意。</div>
              <div class="privacy-check-row tap" data-tap="togglePrivacyConsent">
                <div class="privacy-checkbox ${cx({ checked: this.data.privacyChecked })}">${when(this.data.privacyChecked, '✓')}</div>
                <div class="privacy-check-copy">我已阅读并同意<span data-tap="openAgreement">《用户服务协议》</span>、<span data-tap="openPrivacy">《隐私政策》</span>及<span data-tap="openLotteryRules">《抽奖活动说明》</span>，并确认已获得同行人员授权后代其提交信息。</div>
              </div>
              <button type="button" class="privacy-confirm ${cx({ enabled: this.data.privacyChecked })}" data-tap="confirmPrivacyConsent">同意并进入</button>
              <div class="privacy-note">如不同意，将无法使用参会登记等需处理个人信息的服务。</div>
            </div>
          </div>
        </div>
      `)}
    `;
  }
}
