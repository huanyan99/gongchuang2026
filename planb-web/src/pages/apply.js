/** 参会登记，对应 wechat-app/miniprogram/pages/apply/index.js */

import { View } from '../core/view.js';
import { html, when, cx } from '../core/dom.js';
import { request, ensureLogin, config } from '../core/api.js';
import { getStorage, setStorage } from '../core/storage.js';
import { showModal, showSheet, toast } from '../core/ui.js';

const COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const GENDER_OPTIONS = ['男', '女'];
const ACCOMMODATION_OPTIONS = ['无需住宿', '需要住宿'];
const EVENT_DATES = { 佛山: '2026-09-18', 济南: '2026-09-22', 上海: '2026-10-21' };
const EVENT_STAY_LABELS = { 佛山: '9月18日晚', 济南: '9月22日晚', 上海: '10月21日晚' };

function blankAttendee(checkinDate) {
  return {
    name: '',
    company: '',
    sameCompany: false,
    gender: '男',
    phone: '',
    position: '',
    accommodation: '无需住宿',
    roomType: '柏楚预定房型',
    checkinDate,
  };
}

function copyAttendee(item, changes) {
  return { ...item, ...(changes || {}) };
}

function attendeePayload(item) {
  const payload = { ...item };
  delete payload.sameCompany;
  return payload;
}

export class ApplyView extends View {
  static auth = 'full';

  static meta = { title: '参会登记', background: '#ffffff', textStyle: 'black' };

  constructor(options) {
    super(options);
    this.data = {
      inviteCode: '',
      name: '',
      phone: '',
      company: '',
      position: '',
      reason: '',
      submitting: false,
      submitted: false,
      applyStatus: '',
      editMode: false,
      editCount: 0,
      editRemaining: 2,
      countOptions: COUNT_OPTIONS,
      attendeeCount: 1,
      attendees: [blankAttendee('')],
      eventCity: '',
      eventStayLabel: '',
    };
  }

  onLoad(options) {
    const memberProfile = getStorage('bochuMemberProfile') || {};
    const applyProfile = getStorage('bochuApplyProfile') || {};
    this.setData({
      inviteCode: (options.inviteCode || '').trim(),
      name: applyProfile.name || memberProfile.name || '',
      phone: applyProfile.phone || '',
      company: applyProfile.company || '',
      position: applyProfile.position || '',
      reason: applyProfile.reason || '',
    });

    const shouldLoadRecord = options.record === '1' || options.ticket === '1';
    if (!shouldLoadRecord) {
      ensureLogin()
        .then(() => request('/api/auth/me', 'GET', {}, {}, { silent: true }))
        .then((user) => {
          // 只预填空白的主要联系人号码；不覆盖手动输入、同行人或已有登记。
          if (user.phoneCountryCode === '86' && /^1\d{10}$/.test(user.phone || '')
            && !this.data.phone && !this.data.attendees[0].phone && !this.phoneEdited) {
            const attendees = this.data.attendees.slice();
            attendees[0] = copyAttendee(attendees[0], { phone: user.phone });
            this.setData({ phone: user.phone, attendees });
          }
        })
        .catch(() => {});
    }

    if (this.data.inviteCode) {
      request(`/api/apply/check-invitation?code=${encodeURIComponent(this.data.inviteCode)}`, 'GET', {}, {}, { silent: true })
        .then((context) => {
          const eventCity = context.eventCity || '';
          const checkinDate = EVENT_DATES[eventCity] || '';
          const attendees = this.data.attendees.map((item) => copyAttendee(item, { checkinDate }));
          attendees[0] = copyAttendee(attendees[0], {
            name: this.data.name,
            phone: this.data.phone,
            company: this.data.company,
            position: this.data.position,
          });
          this.setData({ eventCity, eventStayLabel: EVENT_STAY_LABELS[eventCity] || '活动当晚', attendees });
        })
        .catch(() => {})
        .finally(() => {
          if (shouldLoadRecord) this.loadApplication();
        });
    } else if (shouldLoadRecord) {
      this.loadApplication();
    }
  }

  afterRender() {
    this.$$('.textarea').forEach((node) => this.autoHeight(node));
  }

  autoHeight(node) {
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;
  }

  /* ---------- 表单交互 ---------- */

  onInput(event, dataset) {
    this.assign({ [dataset.field]: event.target.value });
    if (event.target.classList.contains('textarea')) this.autoHeight(event.target);
  }

  onGuestInput(event, dataset) {
    const index = Number(dataset.index);
    const field = dataset.field;
    const value = event.target.value;
    const attendees = this.data.attendees.slice();
    if (index === 0 && field === 'phone') this.phoneEdited = true;
    attendees[index] = copyAttendee(attendees[index], { [field]: value });

    let needsRender = false;
    if (index === 0 && field === 'company') {
      attendees.forEach((item, i) => {
        if (i > 0 && item.sameCompany) {
          attendees[i] = copyAttendee(item, { company: value });
          needsRender = true;
        }
      });
    }
    if (needsRender) this.setData({ attendees });
    else this.assign({ attendees });
  }

  onSameCompany(event, dataset) {
    const index = Number(dataset.index);
    const attendees = this.data.attendees.slice();
    const sameCompany = !attendees[index].sameCompany;
    attendees[index] = copyAttendee(attendees[index], {
      sameCompany,
      company: sameCompany ? attendees[0].company : '',
    });
    this.setData({ attendees });
  }

  async onAttendeeCountChange() {
    const picked = await showSheet({
      title: '同行人数',
      options: COUNT_OPTIONS.map((count) => `${count} 人`),
      currentIndex: COUNT_OPTIONS.indexOf(this.data.attendeeCount),
    });
    if (picked == null) return;
    const attendeeCount = COUNT_OPTIONS[picked];
    const attendees = this.data.attendees.slice(0, attendeeCount);
    while (attendees.length < attendeeCount) {
      attendees.push(blankAttendee(EVENT_DATES[this.data.eventCity] || ''));
    }
    this.setData({ attendeeCount, attendees });
  }

  async onGenderChange(event, dataset) {
    const index = Number(dataset.index);
    const picked = await showSheet({
      title: '性别',
      options: GENDER_OPTIONS,
      currentIndex: GENDER_OPTIONS.indexOf(this.data.attendees[index].gender),
    });
    if (picked == null) return;
    const attendees = this.data.attendees.slice();
    attendees[index] = copyAttendee(attendees[index], { gender: GENDER_OPTIONS[picked] });
    this.setData({ attendees });
  }

  async onAccommodationChange(event, dataset) {
    const index = Number(dataset.index);
    const picked = await showSheet({
      title: '住宿要求',
      options: ACCOMMODATION_OPTIONS,
      currentIndex: ACCOMMODATION_OPTIONS.indexOf(this.data.attendees[index].accommodation),
    });
    if (picked == null) return;
    const attendees = this.data.attendees.slice();
    attendees[index] = copyAttendee(attendees[index], { accommodation: ACCOMMODATION_OPTIONS[picked] });
    this.setData({ attendees });
  }

  /* ---------- 提交与记录 ---------- */

  submit() {
    if (config.privacyPopup && !getStorage('bochuPrivacyAccepted')) {
      showModal({
        title: '请先同意相关协议',
        content: '请返回首页阅读并同意《用户服务协议》和《隐私政策》后再提交登记。',
        showCancel: false,
      });
      return;
    }
    if (this.data.submitting) return;

    const attendees = this.data.attendees.map((item) => copyAttendee(item, {
      name: item.name.trim(),
      company: item.company.trim(),
      phone: item.phone.trim(),
      position: item.position.trim(),
    }));
    for (let i = 0; i < attendees.length; i += 1) {
      if (!attendees[i].name) return toast(`请填写第${i + 1}位姓名`);
      if (!/^1\d{10}$/.test(attendees[i].phone)) return toast(`第${i + 1}位手机号有误`);
    }

    const name = attendees[0].name;
    const phone = attendees[0].phone;
    if (!this.data.inviteCode && !this.data.editMode) return toast('缺少邀请码');

    this.setData({ submitting: true, name, phone, attendees });
    const payload = {
      invitationCode: this.data.inviteCode,
      name,
      phone,
      company: attendees[0].company,
      position: attendees[0].position,
      reason: this.data.reason,
      attendeeCount: attendees.length,
      attendees: attendees.map(attendeePayload),
    };

    return ensureLogin()
      .then(() => request('/api/apply', this.data.editMode ? 'PUT' : 'POST', payload))
      .then(() => {
        setStorage('lastApplyPhone', phone);
        setStorage('bochuApplyProfile', {
          name: attendees[0].name,
          phone,
          company: attendees[0].company,
          position: attendees[0].position,
          reason: this.data.reason,
        });
        this.loadApplication();
      })
      .catch(() => {})
      .finally(() => this.setData({ submitting: false }));
  }

  loadApplication() {
    return ensureLogin()
      .then(() => request('/api/apply/me'))
      .then((record) => this.applyRecord(record))
      .catch((err) => {
        if (err && err.code === 3002) this.setData({ submitted: false });
      });
  }

  applyRecord(record) {
    const inviteOverride = record.status === 'REJECTED'
      && !!this.data.inviteCode
      && !!this.data.eventCity
      && this.data.inviteCode !== record.invitationCode;
    const eventCity = inviteOverride ? this.data.eventCity : (record.eventCity || this.data.eventCity);
    const attendees = (record.attendees || []).map((guest) => copyAttendee(guest, {
      sameCompany: false,
      checkinDate: inviteOverride ? (EVENT_DATES[eventCity] || '') : (guest.checkinDate || EVENT_DATES[eventCity] || ''),
    }));
    const editCount = Number(record.editCount || 0);

    this.setData({
      submitted: true,
      editMode: false,
      applyStatus: record.status || '',
      name: record.name || this.data.name,
      phone: record.phone || this.data.phone,
      company: record.company || '',
      position: record.position || '',
      reason: record.reason || '',
      attendees: attendees.length ? attendees : this.data.attendees,
      attendeeCount: attendees.length || 1,
      eventCity,
      inviteCode: inviteOverride ? this.data.inviteCode : (record.invitationCode || this.data.inviteCode),
      eventStayLabel: EVENT_STAY_LABELS[eventCity] || '活动当晚',
      editCount,
      editRemaining: Math.max(0, 2 - editCount),
    });
  }

  async startEdit() {
    if (this.data.editRemaining <= 0) {
      showModal({ title: '无法修改', content: '每份登记信息最多修改两次。', showCancel: false });
      return;
    }
    const result = await showModal({
      title: '修改登记信息',
      content: `每人共有两次修改机会，您还剩 ${this.data.editRemaining} 次。修改提交后需要重新审核。`,
      confirmText: '开始修改',
    });
    if (result.confirm) this.setData({ submitted: false, editMode: true });
  }

  goLottery() {
    this.router.navigateTo('/lottery');
  }

  backHome() {
    this.router.navigateBack();
  }

  /* ---------- 视图 ---------- */

  guestCard(guest, index) {
    return html`
      <div class="guest-card">
        <div class="guest-title">${index === 0 ? '主要联系人' : `同行人 ${index + 1}`}</div>

        <div class="form-item">
          <div class="label">姓名 <span class="req">*</span></div>
          <input name="name${index}" value="${guest.name}" data-index="${index}" data-field="name" data-input="onGuestInput" placeholder="请填写姓名" />
        </div>

        <div class="form-item">
          <div class="label">公司</div>
          ${when(index > 0, html`
            <label class="same-company tap" data-index="${index}" data-tap="onSameCompany">
              <span class="wx-checkbox ${cx({ 'is-checked': guest.sameCompany })}"></span>与主要联系人一致
            </label>
          `)}
          <input name="company${index}" value="${guest.company}" ${guest.sameCompany ? 'disabled' : ''} data-index="${index}" data-field="company" data-input="onGuestInput" placeholder="公司或单位名称" />
        </div>

        <div class="form-row">
          <div class="form-item half">
            <div class="label">性别 <span class="req">*</span></div>
            <div class="picker-value tap" data-index="${index}" data-tap="onGenderChange">${guest.gender} ›</div>
          </div>
          <div class="form-item half">
            <div class="label">职位</div>
            <input name="position${index}" value="${guest.position}" data-index="${index}" data-field="position" data-input="onGuestInput" placeholder="请填写职位" />
          </div>
        </div>

        <div class="form-item">
          <div class="label">手机号 <span class="req">*</span></div>
          <input name="phone${index}" type="tel" inputmode="numeric" maxlength="11" value="${guest.phone}" data-index="${index}" data-field="phone" data-input="onGuestInput" placeholder="用于签到核验" />
        </div>

        <div class="form-item">
          <div class="label">住宿要求 <span class="req">*</span></div>
          <div class="picker-value tap" data-index="${index}" data-tap="onAccommodationChange">${guest.accommodation} ›</div>
        </div>

        ${when(guest.accommodation === '需要住宿', () => html`
          <div class="stay-info">
            <div class="form-item"><div class="label">房型</div><div class="fixed-value">柏楚预定房型</div></div>
            <div class="form-item"><div class="label">入住时间</div><div class="fixed-value">${this.data.eventStayLabel}</div></div>
          </div>
        `)}
      </div>
    `;
  }

  resultCard() {
    const { applyStatus } = this.data;
    return html`
      <div class="result-card">
        <div class="result-eyebrow">REGISTRATION STATUS</div>
        <div class="result-title">
          ${applyStatus === 'APPROVED' ? '审核已通过' : (applyStatus === 'REJECTED' ? '审核未通过' : '已提交，等待审核')}
        </div>
        <div class="result-sub">
          ${applyStatus === 'PENDING'
            ? '会务团队正在审核您的参会登记，通过后可以前往领取抽奖码。'
            : (applyStatus === 'REJECTED'
              ? '本次登记未通过审核，您可以修改登记信息后重新提交审核。'
              : '您的参会登记已审核通过，可以前往领取抽奖码。')}
        </div>

        <div class="guest-badge">贵宾 · ${this.data.name}</div>

        ${when(applyStatus === 'APPROVED' || applyStatus === 'REJECTED', () => html`
          <div class="approved-actions">
            ${when(applyStatus === 'APPROVED', html`
              <button type="button" class="cta lottery-action" data-tap="goLottery">领取抽奖码</button>
            `)}
            <button type="button" class="cta edit-action" data-tap="startEdit" ${this.data.editRemaining <= 0 ? 'disabled' : ''}>修改参会登记信息</button>
            <div class="edit-chance">每人共有 2 次修改机会 · 当前剩余 ${this.data.editRemaining} 次</div>
          </div>
        `)}

        <button type="button" class="cta secondary" data-tap="backHome">返回共创会</button>
      </div>
    `;
  }

  formCard() {
    return html`
      <div class="form-card">
        <div class="card-head">
          <div><div class="card-kicker">VIP LETTER</div></div>
          <div class="invite-ribbon">
            <div class="ribbon-wing left"></div>
            <div class="ribbon-knot"></div>
            <div class="ribbon-wing right"></div>
            <div class="ribbon-tail left"></div>
            <div class="ribbon-tail right"></div>
          </div>
        </div>

        <div class="form">
          <div class="form-item attendee-count">
            <div class="label">同行人数 <span class="req">*</span></div>
            <div class="picker-value tap" data-tap="onAttendeeCountChange">${this.data.attendeeCount} 人 ›</div>
          </div>

          ${this.data.attendees.map((guest, index) => this.guestCard(guest, index))}

          <div class="form-item last">
            <div class="label">参会备注</div>
            <textarea class="textarea" name="reason" rows="1" maxlength="200" placeholder="如有接待偏好可简要填写（选填）" data-field="reason" data-input="onInput">${this.data.reason}</textarea>
          </div>
        </div>
      </div>
    `;
  }

  template() {
    const { submitted, editMode } = this.data;
    return html`
      <div class="page-scroll">
        <div class="page ${cx({ done: submitted })}">
          <div class="head">
            <img class="head-bg" src="assets/banner.jpg" alt="" />
            <div class="head-shade"></div>
            <div class="head-copy">
              <div class="eyebrow">${submitted ? 'REGISTRATION' : 'INVITATION'}</div>
              <div class="title">${submitted ? '登记状态' : (editMode ? '修改登记' : '贵宾登记')}</div>
              <div class="gold-line"></div>
              ${when(!submitted, html`
                <div class="sub">${editMode ? '修改提交后将重新进入审核' : '确认邀请函，并完善您的参会信息'}</div>
              `)}
            </div>
          </div>

          ${submitted ? this.resultCard() : this.formCard()}
        </div>
      </div>

      ${when(!submitted, () => html`
        <div class="cta-wrap fixed">
          <button type="button" class="cta" ${this.data.submitting ? 'disabled' : ''} data-tap="submit">
            ${this.data.submitting ? '提交中 ···' : (editMode ? '提交修改并重新审核' : '确认提交邀请函')}
          </button>
          <div class="privacy-tip">提交后将用于入场核验与接待服务</div>
        </div>
      `)}
    `;
  }
}
