/**
 * 参会服务三页，对应 pages/invitation-letter、pages/agenda、pages/route。
 * 均为静态内容页，只接收 city 参数。
 */

import { View } from '../core/view.js';
import { html, when, cx } from '../core/dom.js';
import { copyText, showSheet, toast } from '../core/ui.js';

const EVENT_DATES = { 佛山: '9月18日', 济南: '9月22日', 上海: '10月21日' };

const AGENDA = [
  ['13:00', '嘉宾签到', '签到入场与自由交流'],
  ['14:00', '峰会开幕', '主办方致辞与年度分享'],
  ['14:40', '主题演讲', '行业趋势与创新实践'],
  ['16:00', '价值共创', '合作伙伴交流与案例分享'],
  ['17:30', '晚宴交流', '抽奖仪式与贵宾晚宴'],
];

// 各场次会场与交通信息；与小程序 pages/route/index.js 保持一致，上海场待会务确认后补充。
const VENUES = {
  佛山: {
    hotel: '佛山万豪酒店',
    address: '广东省佛山市南海区桂城街道海八东路38号',
    hall: '五楼千灯湖厅',
    distances: [
      { name: '佛山火车西站', detail: '约 15 公里 · 车程约 30 分钟' },
      { name: '广州火车南站', detail: '约 25 公里 · 车程约 35 分钟' },
      { name: '佛山沙堤机场', detail: '约 9 公里 · 车程约 20 分钟' },
      { name: '广州白云国际机场', detail: '约 48 公里 · 车程约 50 分钟' },
    ],
    services: [],
    around: [],
  },
  济南: {
    hotel: '济南君廷酒店',
    address: '山东省济南市历下区坤顺路606号C塔101',
    hall: '2 楼宴会厅',
    distances: [
      { name: '济南体育中心体育场', detail: '约 1.3 公里 · 车程约 6 分钟' },
      { name: '济南东站', detail: '约 10 公里 · 车程约 15 分钟' },
      { name: '济南西站', detail: '约 20 公里 · 车程约 40 分钟' },
      { name: '济南遥墙机场', detail: '约 23 公里 · 车程约 40 分钟' },
    ],
    services: [
      { name: '塞纳宫餐厅 · 1 楼', detail: '早餐 工作日 6:30-9:30，周末及节假日 6:30-10:00；午餐 11:30-14:00；晚餐 17:30-21:00' },
      { name: '御粟轩中餐厅', detail: '桌餐可签单；午餐 11:30-14:30，晚餐 17:30-22:00' },
      { name: '大堂酒廊 · 1 楼', detail: '10:00-23:00；客房 24 小时点餐' },
      { name: '酒店 WiFi', detail: '团队密码 84569999；或账号填房间号、密码填客人姓氏' },
      { name: '洗衣服务', detail: '8:30-17:00 收件，11:00 之后收取的次日送回' },
      { name: '外卖与快递', detail: '一楼礼宾部代收' },
      { name: '健身房 · B1', detail: '在住客人 24 小时开放，需携带房卡' },
      { name: '游泳池 · B1', detail: '室内恒温泳池，07:00-22:00' },
    ],
    around: [
      { name: '万象城 / 龙湖天街', detail: '约 1 公里 · 车程约 5 分钟' },
      { name: '便利店', detail: '酒店北门对面，步行约 2 分钟' },
      { name: '咖啡店', detail: '约 1 公里 · 车程约 5 分钟' },
    ],
  },
};

/**
 * 拉起地图 App 导航。
 * 用各家的 HTTPS URI 接口而不是 iosamap:// 这类私有协议：装了 App 会被唤起，
 * 没装则回落到网页地图，微信内置浏览器里也能打开。
 * 会场若带 location（GCJ02 经纬度）则直接定点，否则按名称检索。
 */
function mapLinks(venue, city) {
  const name = encodeURIComponent(venue.hotel);
  const address = encodeURIComponent(venue.address);
  const region = encodeURIComponent(city);
  const point = venue.location;

  return {
    高德地图: point
      ? `https://uri.amap.com/marker?position=${point.lng},${point.lat}&name=${name}&src=bochu2026&coordinate=gaode&callnative=1`
      : `https://uri.amap.com/search?keyword=${name}&city=${region}&src=bochu2026&callnative=1`,
    腾讯地图: point
      ? `https://apis.map.qq.com/uri/v1/marker?marker=coord:${point.lat},${point.lng};title:${name};addr:${address}&referer=bochu2026`
      : `https://apis.map.qq.com/uri/v1/search?keyword=${name}&region=${region}&referer=bochu2026`,
    百度地图: `https://api.map.baidu.com/geocoder?address=${address}&output=html&src=bochu2026`,
    苹果地图: `https://maps.apple.com/?q=${name}&address=${address}`,
  };
}

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

  get venue() {
    return VENUES[this.data.city] || null;
  }

  /** 一键导航：选地图 App 后跳转，未安装则回落到网页地图 */
  async openNavigation() {
    const venue = this.venue;
    if (!venue) return toast('会场地址待会务确认');

    const links = mapLinks(venue, this.data.city);
    const names = ['高德地图', '腾讯地图', '百度地图'];
    if (/iPhone|iPad|iPod|Macintosh/i.test(navigator.userAgent)) names.push('苹果地图');

    const picked = await showSheet({ title: `导航到${venue.hotel}`, options: [...names, '复制地址'] });
    if (picked == null) return;
    if (picked === names.length) return this.copyAddress();
    location.href = links[names[picked]];
  }

  async copyAddress() {
    const venue = this.venue;
    const text = venue
      ? `${venue.hotel}\n${venue.address}\n${venue.hall}`
      : `${this.data.city}场会场地址（待会务确认）`;
    const ok = await copyText(text);
    toast(ok ? '会场信息已复制' : '复制失败，请手动记录');
  }

  rows(items, column) {
    return items.map((item) => html`
      <div class="row ${cx({ column })}">
        <span class="row-name">${item.name}</span>
        <span class="row-detail">${item.detail}</span>
      </div>
    `);
  }

  template() {
    const venue = this.venue;
    return html`
      <div class="page-scroll">
        <div class="page">
          <div class="hero">
            <span>VENUE GUIDE</span>
            <span>${this.data.city}场 · 交通路线</span>
          </div>

          <div class="venue">
            <span class="venue-label">活动会场</span>
            <span class="venue-name">${venue ? venue.hotel : `${this.data.city}场会场`}</span>
            <span class="venue-address">${venue ? venue.address : '详细地址待会务团队最终确认'}</span>
            ${when(venue, html`<div class="venue-hall">${venue && venue.hall}</div>`)}
            <div class="venue-actions">
              <button type="button" class="navigate" data-tap="openNavigation">一键导航</button>
              <button type="button" data-tap="copyAddress">复制会场信息</button>
            </div>
          </div>

          ${when(venue, () => html`
            <div class="section">
              <div class="title">交通距离</div>
              ${this.rows(venue.distances, false)}
            </div>
          `)}

          ${when(venue && venue.services.length, () => html`
            <div class="section">
              <div class="title">酒店服务</div>
              ${this.rows(venue.services, true)}
            </div>
          `)}

          ${when(venue && venue.around.length, () => html`
            <div class="section">
              <div class="title">周边</div>
              ${this.rows(venue.around, false)}
            </div>
          `)}

          ${when(!venue, html`
            <div class="notice">会场与交通信息将在会场确定后及时更新</div>
          `)}
        </div>
      </div>
    `;
  }
}
