import { View } from '../core/view.js';
import { request } from '../core/api.js';

export class CheckinView extends View {
  static auth = 'full';
  static meta = { title: '柏楚2026价值共创峰会', background: '#ffffff', textStyle: 'black' };

  onLoad() {
    // 签到码对用户表现为普通首页入口；每次扫码仍在后台新增一条签到记录。
    // 无论签到成功与否都不打断用户，后台可在签到管理中核对结果。
    request('/api/attendance/scan', 'POST', {}, {}, { silent: true })
      .catch(() => {})
      .finally(() => this.router.reLaunch('/home'));
  }

  template() {
    return '';
  }
}
