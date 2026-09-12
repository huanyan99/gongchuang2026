/**
 * 参会服务三页，对应 pages/invitation-letter、pages/agenda、pages/route。
 * 均为静态内容页，只接收 city 参数。
 */

import { View } from '../core/view.js';
import { html } from '../core/dom.js';
import { copyText, toast } from '../core/ui.js';

const EVENT_DATES = { 佛山: '9月18日', 济南: '9月22日', 上海: '10月21日' };

const AGENDA = [
  ['13:00', '嘉宾签到', '签到入场与自由交流'],
  ['14:00', '峰会开幕', '主办方致辞与年度分享'],
  ['14:40', '主题演讲', '行业趋势与创新实践'],
  ['16:00', '价值共创', '合作伙伴交流与案例分享'],
  ['17:30', '晚宴交流', '抽奖仪式与贵宾晚宴'],
];

const ROUTE_TIPS = [
  ['01', '公共交通', '建议优先选择地铁或公共交通，具体线路将在会场确认后更新。'],
  ['02', '出租车 / 网约车', '请预留高峰期通行时间，到达后根据现场指引签到。'],
  ['03', '自驾出行', '停车信息及停车场入口以会务团队后续通知为准。'],
];

class CityView extends View {
  constructor(options) {
    super(options);
    this.data = { city: '' };
  }

  onLoad(options) {
    this.setData({ city: decodeURIComponent(options.city || '') });
  }
}

export class InvitationLetterView extends CityView {
  static meta = { title: '电子邀请函', background: '#0d214d', textStyle: 'white' };

  template() {
    const date = EVENT_DATES[this.data.city] || '待通知';
    return html`
      <div class="page-scroll">
        <div class="page">
          <div class="letter-card">
            <div class="eyebrow">EXCLUSIVE INVITATION</div>
            <div class="title">诚挚邀请</div>
            <div class="gem"></div>
            <div class="body">尊敬的贵宾：</div>
            <div class="body">诚邀您参加柏楚2026价值共创峰会，与行业伙伴共同探讨产业趋势、创新实践与协同发展的更多可能。</div>
            <div class="event"><span>${this.data.city}场</span><span>${date}</span></div>
            <div class="note">具体时间及会场信息以会务团队最终通知为准</div>
          </div>
        </div>
      </div>
    `;
  }
}

export class AgendaView extends CityView {
  static meta = { title: '大会议程', background: '#0d214d', textStyle: 'white' };

  template() {
    return html`
      <div class="page-scroll">
        <div class="page">
          <div class="hero">
            <span>SUMMIT AGENDA</span>
            <span>${this.data.city}场 · 大会议程</span>
            <span>共创价值 · 共启新程</span>
          </div>
          <div class="timeline">
            ${AGENDA.map(([time, title, desc]) => html`
              <div class="item">
                <span>${time}</span>
                <div><span>${title}</span><span>${desc}</span></div>
              </div>
            `)}
          </div>
          <div class="notice">当前为议程预览，最终安排以会务通知为准</div>
        </div>
      </div>
    `;
  }
}

export class RouteView extends CityView {
  static meta = { title: '交通路线', background: '#0d214d', textStyle: 'white' };

  async copyAddress() {
    const ok = await copyText(`${this.data.city}场会场地址（待会务确认）`);
    toast(ok ? '会场信息已复制' : '复制失败，请手动记录');
  }

  template() {
    return html`
      <div class="page-scroll">
        <div class="page">
          <div class="hero">
            <span>VENUE GUIDE</span>
            <span>${this.data.city}场 · 交通路线</span>
          </div>

          <div class="venue">
            <span>活动会场</span>
            <span>${this.data.city}场会场地址</span>
            <span>详细地址待会务团队最终确认</span>
            <button type="button" data-tap="copyAddress">复制会场信息</button>
          </div>

          <div class="section">
            <div class="title">出行建议</div>
            ${ROUTE_TIPS.map(([no, title, desc]) => html`
              <div class="row">
                <span>${no}</span>
                <div><span>${title}</span><span>${desc}</span></div>
              </div>
            `)}
          </div>

          <div class="notice">路线信息将在会场确定后及时更新</div>
        </div>
      </div>
    `;
  }
}
