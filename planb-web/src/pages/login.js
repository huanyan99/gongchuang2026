/**
 * 个人中心 / 登录，对应 wechat-app/miniprogram/pages/login/index.js。
 * 浏览器没有 open-type="getPhoneNumber"：登录按钮只建立会话，
 * 手机号改由参会登记表单手动填写，其余状态机与小程序一致。
 */

import { View } from '../core/view.js';
import { html, when, cx } from '../core/dom.js';
import { request, ensureLogin, loginWithPhone } from '../core/api.js';
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
      wxLogged: false,
      profileReady: false,
      step: 1,
      loginPhone: '',
      loginName: '',
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

  onShow() {
    this.loadProfile();
    if (!this.data.profileReady) this.focusLoginInput();
  }

  /** 极简登录向导：每步渲染后自动聚焦输入框（光标提示） */
  focusLoginInput() {
    this.later(() => {
      const input = document.querySelector('.minimal-login input');
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
        // 静默建立身份不等于用户已点击登录；未登录时保留统一登录入口。
        this.setData({ wxLogged: !!user.phone || this.data.wxLogged || !!getStorage('webLogged') });
        return this.fetchApplyRecord();
      })
      .catch(() => this.setData({ queryFailed: true }));
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
    this.assign({ loginPhone: event.target.value });
  }

  onLoginNameInput(event) {
    this.assign({ loginName: event.target.value });
  }

  handlePhoneNext() {
    const phone = String(this.data.loginPhone || '').trim();
    if (!/^1\d{10}$/.test(phone)) return toast('请输入 11 位手机号');
    this.setData({ step: 2 });
    this.focusLoginInput();
  }

  /** 一键登录：未登录走手机号+姓名登录；已登录仅补全档案。完成后进入首页 */
  handleOneKeyLogin() {
    if (this.data.phoneLogging) return;
    const phone = String(this.data.loginPhone || '').trim();
    const name = String(this.data.loginName || '').trim();
    if (!this.data.wxLogged && !/^1\d{10}$/.test(phone)) {
      this.setData({ step: 1 });
      this.focusLoginInput();
      return toast('请输入 11 位手机号');
    }
    if (!name) return toast('请输入贵宾姓名');
    if (!this.data.gender) return toast('请选择性别');
    this.setData({ phoneLogging: true });
    const login = this.data.wxLogged ? Promise.resolve() : loginWithPhone(phone, name);
    login
      .then(() => request('/api/auth/profile', 'PUT', { name, gender: this.data.gender }))
      .then(() => {
        setStorage('webLogged', true);
        this.setData({ wxLogged: true, profileReady: true, name, genderText: `${this.data.gender}士` });
        toast('登录成功', 'success');
        this.later(() => {
          if (this.data.redirect) this.router.redirectTo(this.data.redirect);
          else this.router.redirectTo('/home');
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

  /* ---------- 极简登录向导（未登录或档案不全时的唯一身份入口） ---------- */

  /** 已登录缺档案的贵宾直接从第二步补全，跳过手机号 */
  effectiveStep() {
    return this.data.wxLogged ? 2 : this.data.step;
  }

  wizardSteps() {
    const step = this.effectiveStep();
    return html`
      <div class="wizard-steps">
        <div class="wizard-step ${cx({ active: step === 1 })}">第一步</div>
        <div class="wizard-step ${cx({ active: step === 2 })}">第二步</div>
      </div>
    `;
  }

  minimalWizard() {
    if (this.effectiveStep() === 1) {
      return html`
        <div class="minimal-login">
          <div class="wizard-title">贵宾登录</div>
          ${this.wizardSteps()}
          <input class="wizard-box" name="loginPhone" value="${this.data.loginPhone}" maxlength="11"
                 inputmode="numeric" autocomplete="tel" placeholder="请输入手机号" data-input="onLoginPhoneInput" />
          <button type="button" class="login-btn primary" data-tap="handlePhoneNext">下一步</button>
        </div>
      `;
    }
    const savedName = this.data.loginName || (this.data.wxLogged ? this.data.name : '');
    return html`
      <div class="minimal-login">
        <div class="wizard-title">贵宾登录</div>
        ${this.wizardSteps()}
        <input class="wizard-box" name="loginName" value="${savedName}" maxlength="32"
               placeholder="请输入姓名" data-input="onLoginNameInput" />
        <div class="wizard-box gender tap ${cx({ empty: !this.data.gender })}" data-tap="onGenderChange">
          ${this.data.gender || '请选择性别'}
        </div>
        <button type="button" class="login-btn primary" ${this.data.phoneLogging ? 'disabled' : ''} data-tap="handleOneKeyLogin">
          ${this.data.phoneLogging ? '登录中' : '一键登录'}
        </button>
      </div>
    `;
  }

  template() {
    const { profileReady } = this.data;
    // 已登录且档案完整 → 个人中心（档案/记录）；其余情况由极简向导接管（唯一身份入口）
    const complete = this.data.wxLogged && this.data.profileReady;
    const minimalWizard = !complete;
    return html`
      <div class="page-scroll">
        <div class="login-page">
          ${when(minimalWizard, this.minimalWizard())}
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
