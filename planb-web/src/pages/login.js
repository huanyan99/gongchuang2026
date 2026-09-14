/**
 * 个人中心 / 登录，对应 wechat-app/miniprogram/pages/login/index.js。
 * 浏览器没有 open-type="getPhoneNumber"：身份即手机号，
 * 登录分两步（手机号 → 姓名），是全站唯一的登录入口。
 */

import { View } from '../core/view.js';
import { html, when, cx } from '../core/dom.js';
import { request, ensureLogin, loginWithPhone, phoneHint, clearIdentityCache } from '../core/api.js';
import { getStorage, setStorage, removeStorage } from '../core/storage.js';
import { showModal, showSheet, toast } from '../core/ui.js';

const STATUS_TEXT = {
  NONE: '未登记',
  PENDING: '审核中',
  APPROVED: '已通过',
  REJECTED: '已驳回',
};

const GENDER_OPTIONS = ['男', '女'];

function formatStayDate(value) {
  const parts = String(value || '').split('-');
  return parts.length === 3 ? `${Number(parts[1])}月${Number(parts[2])}日晚` : (value || '待确认');
}

export class LoginView extends View {
  static meta = { title: '个人中心', background: '#ffffff', textStyle: 'black' };

  constructor(options) {
    super(options);
    this.data = {
      redirect: '',
      authed: false,
      profileReady: false,
      step: 1,
      loginPhone: '',
      loginName: '',
      nameBlank: '',
      hintKnown: false,
      maskedName: '',
      missingCount: 0,
      phoneLogging: false,
      name: '',
      gender: '',
      genderText: '',
      applyRecord: null,
      recordStatus: 'NONE',
      recordStatusText: STATUS_TEXT.NONE,
      queryFailed: false,
    };
  }

  onLoad(options) {
    this.setData({ redirect: options.redirect ? decodeURIComponent(options.redirect) : '' });
  }

  navMeta() {
    const complete = this.data.authed && this.data.profileReady;
    return { title: complete ? '个人中心' : '贵宾登录', background: '#ffffff', textStyle: 'black' };
  }

  afterRender() {
    this.router.sync();
  }

  onShow() {
    this.loadProfile();
    if (!this.data.profileReady) this.focusLoginInput();
  }

  /** 极简登录向导：每步渲染后自动聚焦输入框（光标提示） */
  focusLoginInput() {
    this.later(() => {
      const input = this.$('.login-wizard input');
      if (input) input.focus();
    }, 150);
  }

  loadProfile() {
    const profile = getStorage('bochuMemberProfile') || {};
    this.setData({
      profileReady: !!(profile.name && profile.gender),
      name: profile.name || this.data.name,
      gender: profile.gender || this.data.gender,
      genderText: profile.gender ? `${profile.gender}士` : '',
    });

    return ensureLogin()
      .then(() => request('/api/auth/me', 'GET', {}, {}, { silent: true }))
      .then((user) => {
        if (user.name && user.gender) {
          this.setData({
            profileReady: true,
            name: user.name,
            gender: user.gender,
            genderText: `${user.gender}士`,
          });
          setStorage('bochuMemberProfile', { name: user.name, gender: user.gender });
        }
        // 网页身份就是手机号：拿到手机号才算完成登录
        this.setData({ authed: !!user.phone });
        if (user.phone && !user.name) {
          this.assign({ loginPhone: user.phone });
          this.loadPhoneHint(user.phone);
        }
        return this.fetchApplyRecord();
      })
      .catch((err) => {
        if (err && err.code === 1001) {
          this.setData({ authed: false, profileReady: false });
          return;
        }
        this.setData({ queryFailed: true });
      });
  }

  fetchApplyRecord() {
    return ensureLogin()
      .then(() => request('/api/apply/me', 'GET', {}, {}, { silent: true }))
      .then((record) => {
        if (record && Array.isArray(record.attendees)) {
          record.attendees = record.attendees.map((guest) => ({
            ...guest,
            checkinDateText: formatStayDate(guest.checkinDate),
          }));
        }
        const primaryGuest = record && record.attendees && record.attendees.length ? record.attendees[0] : null;
        const databaseName = (record && record.name) || (primaryGuest && primaryGuest.name) || '';
        const databaseGender = (primaryGuest && primaryGuest.gender) || '';
        const status = record && record.status ? record.status : 'NONE';
        if (record && record.phone) setStorage('lastApplyPhone', record.phone);

        this.setData({
          profileReady: !!databaseName,
          name: databaseName || this.data.name,
          gender: databaseGender || this.data.gender,
          genderText: databaseGender ? `${databaseGender}士` : this.data.genderText,
          applyRecord: record || null,
          recordStatus: status,
          recordStatusText: STATUS_TEXT[status] || status,
          queryFailed: false,
        });

        if (databaseName) {
          setStorage('bochuMemberProfile', {
            name: databaseName,
            gender: databaseGender || this.data.gender || '',
          });
        }
      })
      .catch((err) => {
        if (err && err.code === 3002) {
          removeStorage('lastApplyPhone');
          this.setData({
            applyRecord: null,
            recordStatus: 'NONE',
            recordStatusText: STATUS_TEXT.NONE,
            queryFailed: false,
          });
          return;
        }
        this.setData({ queryFailed: true });
      });
  }

  /* ---------- 交互 ---------- */

  onLoginPhoneInput(event) {
    const digits = event.target.value.replace(/\D/g, '').slice(0, 11);
    event.target.value = digits;
    this.assign({ loginPhone: digits });
  }

  onLoginNameInput(event) {
    this.assign({ loginName: event.target.value });
  }

  onNameBlankInput(event) {
    this.assign({ nameBlank: event.target.value });
  }

  /** 手机号已在参会登记中出现过时，第二步只需补全姓名中被隐藏的字 */
  loadPhoneHint(phone) {
    return phoneHint(phone).then((hint) => this.setData({
      hintKnown: !!(hint && hint.known),
      maskedName: (hint && hint.maskedName) || '',
      missingCount: (hint && hint.missingCount) || 0,
      nameBlank: '',
    }));
  }

  handlePhoneNext() {
    const phone = String(this.data.loginPhone || '').trim();
    if (!/^1\d{10}$/.test(phone)) return toast('请输入 11 位手机号');
    this.setData({ step: 2 });
    this.loadPhoneHint(phone).then(() => this.focusLoginInput());
  }

  /** 掩码姓名的固定部分：张*明 → ['张', '明'] */
  maskedParts() {
    const masked = this.data.maskedName || '';
    const first = masked.indexOf('*');
    const last = masked.lastIndexOf('*');
    if (first < 0) return ['', ''];
    return [masked.slice(0, first), masked.slice(last + 1)];
  }

  /** 补全后的完整姓名，供后端与登记信息比对 */
  completedName() {
    const [prefix, suffix] = this.maskedParts();
    return `${prefix}${String(this.data.nameBlank || '').trim()}${suffix}`;
  }

  /** 登录：姓名核验通过后由后端回填档案；未登记的手机号仍填写姓名与性别 */
  handleOneKeyLogin() {
    if (this.data.phoneLogging) return;
    const phone = String(this.data.loginPhone || '').trim();
    if (!/^1\d{10}$/.test(phone)) {
      this.setData({ step: 1 });
      this.focusLoginInput();
      return toast('请输入 11 位手机号');
    }

    const verifying = this.data.hintKnown;
    const name = verifying ? this.completedName() : String(this.data.loginName || '').trim();
    if (verifying && String(this.data.nameBlank || '').trim().length !== this.data.missingCount) {
      return toast(`请补全姓名中的 ${this.data.missingCount} 个字`);
    }
    if (!name) return toast('请输入贵宾姓名');
    if (!verifying && !this.data.gender) return toast('请选择性别');

    this.setData({ phoneLogging: true });
    loginWithPhone(phone, name)
      .then(() => (verifying ? Promise.resolve() : request('/api/auth/profile', 'PUT', { name, gender: this.data.gender })))
      .then(() => {
        this.setData({ authed: true, profileReady: true, name });
        toast('登录成功', 'success');
        this.later(() => {
          // reLaunch 而不是 redirectTo：登录前那张首页不该留在栈里
          this.router.reLaunch(this.data.redirect || '/home');
        }, 620);
      })
      .catch(() => {})
      .finally(() => this.setData({ phoneLogging: false }));
  }

  async onGenderChange() {
    const picked = await showSheet({
      title: '性别',
      options: GENDER_OPTIONS,
      currentIndex: GENDER_OPTIONS.indexOf(this.data.gender),
    });
    if (picked == null) return;
    this.setData({ gender: GENDER_OPTIONS[picked] });
  }

  openAgreement() {
    this.router.navigateTo('/agreement');
  }

  openPrivacy() {
    this.router.navigateTo('/privacy');
  }

  /** 退出登录：作废后端登录态并清掉本机身份缓存，设备识别码保留 */
  async logout() {
    const confirmed = await showModal({ title: '退出登录', content: '退出后需要重新用手机号和姓名登录。' });
    if (!confirmed.confirm) return;
    request('/api/auth/logout', 'POST', {}, {}, { silent: true }).catch(() => {});
    clearIdentityCache();
    this.setData({
      authed: false,
      profileReady: false,
      step: 1,
      loginPhone: '',
      loginName: '',
      nameBlank: '',
      hintKnown: false,
      maskedName: '',
      name: '',
      gender: '',
      genderText: '',
      applyRecord: null,
      recordStatus: 'NONE',
      recordStatusText: STATUS_TEXT.NONE,
    });
    toast('已退出登录');
  }

  requestPersonalInfoDeletion() {
    showModal({
      title: '注销并删除个人信息',
      content: '请联系会务人员或发送邮件至 it@bochu.com。完成身份核验后，我们将为您办理注销及个人信息删除。',
      showCancel: false,
    });
  }

  goHome() {
    this.router.navigateBack();
  }

  goLottery() {
    if (!this.data.applyRecord || this.data.applyRecord.status !== 'APPROVED') {
      showModal({
        title: '暂不可领取',
        content: '参会登记审核通过后方可领取抽奖码。',
        showCancel: false,
      });
      return;
    }
    this.router.navigateTo('/lottery');
  }

  /* ---------- 视图 ---------- */

  /** 已登录且档案完整时展示（未登录/缺档案由极简向导接管） */
  loginPanel() {
    const record = this.data.applyRecord;
    return html`
      <div class="panel-card record-card">
        <div class="panel-head">
          <div class="panel-title">参会登记记录</div>
          <div class="record-status ${this.data.recordStatus}">${this.data.recordStatusText}</div>
        </div>
        ${record ? html`
          <div class="info-row">
            <span>参会场次</span>
            <span>${record.eventCity || '待确认'}场</span>
          </div>
          <div class="info-row">
            <span>同行人数</span>
            <span>${(record.attendees && record.attendees.length) || 1} 人</span>
          </div>
          ${(record.attendees || []).map((guest) => html`
            <div class="attendee-detail">
              <div class="attendee-title">${guest.guestIndex === 1 ? '主要联系人' : `同行人 ${guest.guestIndex}`}</div>
              <div class="detail-row"><span>姓名</span><span>${guest.name}</span></div>
              <div class="detail-row"><span>公司</span><span>${guest.company || '未填写'}</span></div>
              <div class="detail-row"><span>性别</span><span>${guest.gender}</span></div>
              <div class="detail-row"><span>手机号</span><span>${guest.phone}</span></div>
              <div class="detail-row"><span>职位</span><span>${guest.position || '未填写'}</span></div>
              <div class="detail-row"><span>住宿要求</span><span>${guest.accommodation}</span></div>
              <div class="detail-row"><span>房型</span><span>${guest.roomType}</span></div>
              <div class="detail-row"><span>入住时间</span><span>${guest.checkinDateText}</span></div>
            </div>
          `)}
        ` : html`
          <div class="empty-record">${this.data.queryFailed ? '登记记录查询失败，请稍后重试' : '暂无参会登记记录'}</div>
        `}
      </div>
    `;
  }

  /* ---------- 登录向导（未登录或档案不全时的唯一身份入口） ---------- */

  /** 已登录缺档案的贵宾直接从第二步补全，跳过手机号 */
  effectiveStep() {
    return this.data.authed ? 2 : this.data.step;
  }

  phoneStep() {
    return html`
      <div class="panel-card">
        <div class="form-item">
          <div class="label">手机号</div>
          <input class="login-input" name="loginPhone" type="tel" inputmode="numeric" maxlength="11"
                 autocomplete="tel" value="${this.data.loginPhone}" placeholder="请输入手机号"
                 data-input="onLoginPhoneInput" />
        </div>
      </div>
      <button type="button" class="login-btn primary" data-tap="handlePhoneNext">下一步</button>
    `;
  }

  /** 手机号已登记：只补全姓名中隐藏的字，性别由登记信息带出 */
  verifyStep() {
    const [prefix, suffix] = this.maskedParts();
    return html`
      <div class="panel-card verify-card">
        <div class="label">姓名核验</div>
        <div class="masked-name">
          <span>${prefix}</span>
          <input class="name-blank" name="nameBlank" maxlength="${this.data.missingCount}"
                 value="${this.data.nameBlank}" data-input="onNameBlankInput" />
          <span>${suffix}</span>
        </div>
      </div>
      <button type="button" class="login-btn primary" ${this.data.phoneLogging ? 'disabled' : ''}
              data-tap="handleOneKeyLogin">${this.data.phoneLogging ? '登录中' : '进入'}</button>
    `;
  }

  profileStep() {
    return html`
      <div class="panel-card">
        <div class="form-item">
          <div class="label">姓名</div>
          <input class="login-input" name="loginName" maxlength="32" value="${this.data.loginName}"
                 placeholder="请输入姓名" data-input="onLoginNameInput" />
        </div>
        <div class="form-item">
          <div class="label">性别</div>
          <div class="login-input picker tap ${cx({ empty: !this.data.gender })}" data-tap="onGenderChange">
            ${this.data.gender || '请选择性别'}
          </div>
        </div>
      </div>
      <button type="button" class="login-btn primary" ${this.data.phoneLogging ? 'disabled' : ''}
              data-tap="handleOneKeyLogin">${this.data.phoneLogging ? '登录中' : '一键登录'}</button>
    `;
  }

  loginWizard() {
    const step = this.effectiveStep();
    return html`
      <div class="login-wizard">
        <div class="login-hero">
          <div class="eyebrow">BOCHU INVITATION</div>
          <div class="title">贵宾登录</div>
          <div class="sub">柏楚2026价值共创峰会</div>
        </div>

        <div class="login-steps">
          <span class="on"></span>
          <span class="${cx({ on: step >= 2 })}"></span>
        </div>

        ${step === 1 ? this.phoneStep() : (this.data.hintKnown ? this.verifyStep() : this.profileStep())}
      </div>
    `;
  }

  template() {
    const { profileReady } = this.data;
    // 已登录且档案完整 → 个人中心（档案/记录）；其余情况由极简向导接管（唯一身份入口）
    const complete = this.data.authed && this.data.profileReady;
    const minimalWizard = !complete;
    return html`
      <div class="page-scroll">
        <div class="login-page">
          ${when(minimalWizard, this.loginWizard())}
          ${when(complete, html`
            <div class="login-hero">
              <div class="eyebrow">BOCHU INVITATION</div>
              <div class="title">${profileReady ? '个人中心' : '贵宾登录'}</div>
              ${when(!profileReady, html`<div class="sub">柏楚2026价值共创峰会</div>`)}
            </div>

            <div class="member-card ${cx({ compact: profileReady })}">
              <div class="card-shine"></div>
              ${when(profileReady, html`<div class="profile-badge">贵宾档案</div>`)}
              <div class="card-label">BOCHU</div>
              <div class="card-title">${profileReady ? this.data.name : 'VALUE CO-CREATION'}</div>
              <div class="card-sub">${profileReady ? this.data.genderText : '2026 VIP ACCESS'}</div>
              <div class="card-lines">
                <div></div>
                <div></div>
                <div></div>
              </div>
            </div>

            <div class="login-panel">${this.loginPanel()}</div>

            <div class="agreement-footer">
              <div>我们尊重并保护您的个人信息。</div>
              <div class="agreement-links">
                <span class="agreement-link tap" data-tap="openAgreement">《用户服务协议》</span>
                <span>及</span>
                <span class="agreement-link tap" data-tap="openPrivacy">《隐私政策》</span>
              </div>
              <div class="delete-info-link tap" data-tap="requestPersonalInfoDeletion">注销并删除个人信息</div>
            ${when(complete, html`<button type="button" class="logout-btn" data-tap="logout">退出登录</button>`)}
            </div>
          `)}
        </div>
      </div>

      <nav class="bottom-nav">
        <div class="nav-item tap" data-tap="goHome">
          <div class="nav-icon home-icon"><div></div></div>
          <div class="nav-text">共创会</div>
        </div>
        <div class="nav-center tap" data-tap="goLottery">
          <div class="qr-circle lottery-circle">
            <div class="lottery-mark">LUCKY</div>
            <div class="lottery-mark-cn">抽奖码</div>
          </div>
        </div>
        <div class="nav-item active">
          <div class="nav-icon user-icon"><div></div></div>
          <div class="nav-text">个人中心</div>
        </div>
      </nav>
    `;
  }
}
