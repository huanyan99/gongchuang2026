/**
 * 个人中心 / 登录，对应 wechat-app/miniprogram/pages/login/index.js。
 * 浏览器没有 open-type="getPhoneNumber"：登录按钮只建立会话，
 * 手机号改由参会登记表单手动填写，其余状态机与小程序一致。
 */

import { View } from '../core/view.js';
import { html, when, cx } from '../core/dom.js';
import { request, ensureLogin } from '../core/api.js';
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
      logging: false,
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

  handleLogin() {
    if (this.data.logging) return;
    this.setData({ logging: true });

    ensureLogin()
      .then(() => {
        setStorage('webLogged', true);
        this.setData({ wxLogged: true });
        toast('已登录，请完善贵宾信息');
        return this.fetchApplyRecord();
      })
      .catch((err) => {
        const stage = (err && err.stage) || '登录';
        const code = err && err.code != null ? err.code : '未知';
        showModal({
          title: '登录失败',
          content: `${(err && err.message) || '请稍后重试'}\n阶段：${stage}\n错误码：${code}`,
          showCancel: false,
        });
      })
      .finally(() => this.setData({ logging: false }));
  }

  onNameInput(event) {
    this.assign({ name: event.target.value });
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

  completeLogin() {
    const name = String(this.data.name || '').trim();
    if (!name) return toast('请填写姓名');
    if (!this.data.gender) return toast('请选择性别');

    return request('/api/auth/profile', 'PUT', { name, gender: this.data.gender })
      .then(() => {
        setStorage('bochuMemberProfile', { name, gender: this.data.gender });
        this.setData({ profileReady: true, wxLogged: true, genderText: `${this.data.gender}士` });
        toast('保存成功', 'success');
        this.later(() => {
          if (this.data.redirect) {
            this.router.redirectTo(this.data.redirect);
            return;
          }
          this.fetchApplyRecord();
        }, 520);
      })
      .catch(() => {});
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

  loginPanel() {
    if (!this.data.wxLogged) {
      return html`
        <button type="button" class="login-btn primary" ${this.data.logging ? 'disabled' : ''} data-tap="handleLogin">
          ${this.data.logging ? '登录中 ···' : '登录'}
        </button>
        <div class="hint">网页版不提供微信手机号授权，登录后请在参会登记中填写手机号，用于会务联络及签到核验。</div>
      `;
    }

    if (!this.data.profileReady) {
      return html`
        <div class="panel-card">
          <div class="panel-title">贵宾信息</div>
          <div class="form-item">
            <div class="label">姓名</div>
            <input name="name" value="${this.data.name}" maxlength="32" placeholder="请输入姓名" data-input="onNameInput" />
          </div>
          <div class="form-item">
            <div class="label">性别</div>
            <div class="picker-value tap ${cx({ empty: !this.data.gender })}" data-tap="onGenderChange">${this.data.gender || '请选择性别'}</div>
          </div>
        </div>
        <button type="button" class="login-btn primary" data-tap="completeLogin">完成登录</button>
      `;
    }

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

  template() {
    const { profileReady } = this.data;
    return html`
      <div class="page-scroll">
        <div class="login-page">
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
