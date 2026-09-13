/** 邀请列表，对应 wechat-app/miniprogram/pages/invitation-list/index.js */

import { View } from '../core/view.js';
import { html, when, cx } from '../core/dom.js';
import { request, ensureLogin } from '../core/api.js';
import { showModal, toast } from '../core/ui.js';

const STATUS_TEXT = { PENDING: '待审核', APPROVED: '已审核', REJECTED: '已拒绝' };

function formatStayDate(value) {
  const parts = String(value || '').split('-');
  return parts.length === 3 ? `${Number(parts[1])}月${Number(parts[2])}日晚` : (value || '待确认');
}

function statusText(item) {
  if (item.checkedInAt) return '已入场';
  return STATUS_TEXT[item.status] || item.status;
}

export class InvitationListView extends View {
  static auth = 'full';

  static meta = { title: '邀请列表', background: '#0d214d', textStyle: 'white' };

  constructor(options) {
    super(options);
    this.data = {
      city: '',
      activeStatus: 'PENDING',
      applications: [],
      filteredApplications: [],
      stats: { pending: 0, approved: 0, checkedIn: 0 },
      loading: true,
    };
  }

  onLoad(options) {
    this.setData({ city: decodeURIComponent(options.city || '') });
    this.refresh();
  }

  refresh() {
    this.setData({ loading: true });
    return ensureLogin()
      .then(() => Promise.all([
        request('/api/invitations/mine', 'GET', {}, {}, { silent: true }),
        request('/api/invitations/applications', 'GET', {}, {}, { silent: true }),
      ]))
      .then(([invitations, applications]) => {
        const cityByCode = {};
        (invitations || []).forEach((item) => { cityByCode[item.code] = item.eventCity; });
        const rows = (applications || [])
          .filter((item) => cityByCode[item.invitationCode] === this.data.city)
          .map((item) => ({
            ...item,
            statusText: statusText(item),
            attendees: (item.attendees || []).map((guest) => ({
              ...guest,
              checkinDateText: formatStayDate(guest.checkinDate),
            })),
          }));

        this.setData({
          applications: rows,
          filteredApplications: this.filterRows(rows, this.data.activeStatus),
          stats: {
            pending: rows.filter((item) => item.status === 'PENDING').length,
            approved: rows.filter((item) => item.status === 'APPROVED' && !item.checkedInAt).length,
            checkedIn: rows.filter((item) => !!item.checkedInAt).length,
          },
        });
      })
      .catch(() => {})
      .finally(() => this.setData({ loading: false }));
  }

  filterRows(rows, status) {
    if (status === 'CHECKED_IN') return rows.filter((item) => !!item.checkedInAt);
    if (status === 'APPROVED') return rows.filter((item) => item.status === 'APPROVED' && !item.checkedInAt);
    return rows.filter((item) => item.status === status);
  }

  selectStatus(event, dataset) {
    const activeStatus = dataset.status;
    this.setData({
      activeStatus,
      filteredApplications: this.filterRows(this.data.applications, activeStatus),
    });
  }

  async review(event, dataset) {
    const { id, status } = dataset;
    const action = status === 'APPROVED' ? '通过' : '拒绝';
    const result = await showModal({
      title: `${action}该登记？`,
      editable: status === 'REJECTED',
      placeholderText: '拒绝原因（可选）',
    });
    if (!result.confirm) return;

    return request(`/api/invitations/applications/${id}/review`, 'POST', { status, remark: result.content || '' })
      .then(() => {
        toast(`已${action}`, 'success');
        this.refresh();
      })
      .catch(() => {});
  }

  template() {
    const { stats } = this.data;
    return html`
      <div class="page-scroll">
        <div class="page">
          <div class="hero">
            <span class="eyebrow">INVITATION LIST</span>
            <span class="title">${this.data.city}场邀请列表</span>
            <span class="sub">登记审核与入场状态管理</span>
          </div>

          <div class="status-tabs">
            <div class="tap ${cx({ active: this.data.activeStatus === 'PENDING' })}" data-status="PENDING" data-tap="selectStatus">
              <span>${stats.pending}</span><span>待审核</span>
            </div>
            <div class="tap ${cx({ active: this.data.activeStatus === 'APPROVED' })}" data-status="APPROVED" data-tap="selectStatus">
              <span>${stats.approved}</span><span>已审核</span>
            </div>
            <div class="tap ${cx({ active: this.data.activeStatus === 'CHECKED_IN' })}" data-status="CHECKED_IN" data-tap="selectStatus">
              <span>${stats.checkedIn}</span><span>已入场</span>
            </div>
          </div>

          ${this.data.loading
            ? html`<div class="empty">正在加载...</div>`
            : when(!this.data.filteredApplications.length, html`<div class="empty">当前暂无相关登记</div>`)}

          ${this.data.filteredApplications.map((item) => html`
            <div class="record-card">
              <div class="record-head"><span>${item.name}</span><span>${item.statusText}</span></div>
              <div class="record-summary">
                <span>参会场次</span><span>${this.data.city}场</span>
                <span>同行人数</span><span>${item.attendees.length || 1} 人</span>
              </div>

              ${when(item.attendees.length, () => html`
                <div class="guest-list">
                  ${item.attendees.map((guest) => html`
                    <div class="guest-row">
                      <div class="guest-title">${guest.guestIndex === 1 ? '主要联系人' : `同行人 ${guest.guestIndex}`}</div>
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
                </div>
              `)}

              ${when(item.status === 'PENDING', () => html`
                <div class="review-actions">
                  <button type="button" data-id="${item.id}" data-status="REJECTED" data-tap="review">拒绝</button>
                  <button type="button" class="approve" data-id="${item.id}" data-status="APPROVED" data-tap="review">审核通过</button>
                </div>
              `)}
            </div>
          `)}
        </div>
      </div>
    `;
  }
}
