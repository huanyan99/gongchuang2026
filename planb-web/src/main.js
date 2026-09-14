/** 入口：初始化视口缩放、注册路由、同步导航栏。 */

import { initViewport } from './core/viewport.js';
import { Router } from './core/router.js';
import { configureWechatShare } from './core/wechat-share.js';

import { HomeView } from './pages/home.js';
import { ApplyView } from './pages/apply.js';
import { LotteryView } from './pages/lottery.js';
import { LoginView } from './pages/login.js';
import { InvitationsView } from './pages/invitations.js';
import { InvitationListView } from './pages/invitation-list.js';
import { AdminView } from './pages/admin.js';
import { SeatView } from './pages/seat.js';
import { PassView } from './pages/pass.js';
import { AgreementView, PrivacyView, LotteryRulesView } from './pages/policy.js';
import { InvitationLetterView, AgendaView, RouteView } from './pages/service.js';

const routes = {
  home: HomeView,
  apply: ApplyView,
  lottery: LotteryView,
  'lottery-rules': LotteryRulesView,
  invitations: InvitationsView,
  'invitation-list': InvitationListView,
  agreement: AgreementView,
  privacy: PrivacyView,
  'invitation-letter': InvitationLetterView,
  agenda: AgendaView,
  route: RouteView,
  seat: SeatView,
  pass: PassView,
  login: LoginView,
  admin: AdminView,
};

const navBar = document.getElementById('navBar');
const navTitle = document.getElementById('navTitle');
const navBack = document.getElementById('navBack');
const themeMeta = document.querySelector('meta[name="theme-color"]');

function syncNavBar(meta, depth) {
  navTitle.textContent = meta.title;
  navBar.style.backgroundColor = meta.background;
  navBar.style.color = meta.textStyle === 'white' ? '#ffffff' : '#000000';
  navBar.classList.toggle('has-back', depth > 1);
  document.title = `${meta.title} · 柏楚2026价值共创峰会`;
  if (themeMeta) themeMeta.setAttribute('content', meta.background);
  configureWechatShare();
}

initViewport();

const router = new Router({
  routes,
  container: document.getElementById('stageBody'),
  onChange: syncNavBar,
});

navBack.addEventListener('click', () => router.navigateBack());

// 邀请链接形如 index.html?code=XXXX，等价于小程序的启动参数；
// 微信授权回调也带 ?code=...&state=...，以是否带 state 区分，避免把授权 code 当成邀请码
const launchParams = new URLSearchParams(location.search);
const isOAuthReturn = launchParams.has('state');
const launchQuery = {};
launchParams.forEach((value, key) => {
  if (isOAuthReturn && (key === 'code' || key === 'state')) return;
  launchQuery[key] = value;
});

router.start(launchQuery);
