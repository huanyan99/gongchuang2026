/**
 * 抽奖码，对应 wechat-app/miniprogram/pages/lottery/index.js。
 * 摇号阶段每 56ms 刷新一次数字：这里直接改 DOM 而不是整页重绘，
 * 否则节点重建会打断 CSS 动画（小程序 setData 是 diff 更新，效果等价）。
 */

import { View } from '../core/view.js';
import { html, when } from '../core/dom.js';
import { request, ensureLogin } from '../core/api.js';
import { toast, vibrate } from '../core/ui.js';

const REEL_COUNT = 4;
const ACTIVATE_AT = [150, 300, 450, 600];
const LOCK_AT = [2400, 2900, 3400, 3900];
const ROLL_INTERVAL = 56;

export class LotteryView extends View {
  static auth = 'full';

  static meta = { title: '抽奖码', background: '#0b1530', textStyle: 'white' };

  constructor(options) {
    super(options);
    this.data = {
      running: false,
      requesting: true,
      drawn: false,
      preparedNumber: '',
      rollingDigits: ['—', '—', '—', '—'],
      finalNumber: '',
      activeReels: [false, false, false, false],
      lockedReels: [false, false, false, false],
      buttonPressed: false,
      reveal: false,
      focusNumber: false,
      showResultText: false,
    };
  }

  onLoad() {
    ensureLogin()
      .then(() => request('/api/lottery/me', 'GET', {}, {}, { silent: true }))
      .then((result) => this.prepareCode(result.luckyCode))
      .catch((err) => {
        if (!err || err.code !== 4001) toast((err && err.message) || '抽奖信息加载失败');
      })
      .finally(() => this.setData({ requesting: false }));
  }

  onUnload() {
    this.clearRollingTimer();
    super.onUnload();
  }

  /* ---------- 抽取流程 ---------- */

  startDraw() {
    if (this.data.running || this.data.requesting) return;
    if (this.data.drawn) {
      toast('您的号码已抽取');
      return;
    }

    if (!this.data.preparedNumber) {
      toast('抽奖码尚未加载，请稍后重试');
      return;
    }
    this.assign({ buttonPressed: true });
    this.sync();
    this.beginDraw(this.data.preparedNumber);
  }

  prepareCode(luckyCode) {
    const finalNumber = String(luckyCode || '').padStart(4, '0').slice(-4);
    if (!/^\d{4}$/.test(finalNumber)) return;
    this.setData({ preparedNumber: finalNumber });
  }

  beginDraw(luckyCode) {
    const finalNumber = String(luckyCode || '').padStart(4, '0').slice(-4);
    if (!/^\d{4}$/.test(finalNumber)) {
      toast('抽奖码格式异常');
      return;
    }

    this.finalDigits = finalNumber.split('');
    this.assign({
      running: true,
      buttonPressed: true,
      rollingDigits: this.randomDigits(),
      activeReels: [false, false, false, false],
      lockedReels: [false, false, false, false],
      showResultText: false,
    });
    this.sync();
    vibrate(12);

    this.later(() => {
      this.assign({ buttonPressed: false });
      this.sync();
    }, 280);

    ACTIVATE_AT.forEach((delay, index) => this.later(() => this.activateReel(index), delay));

    this.rollingTimer = setInterval(() => this.advanceReels(), ROLL_INTERVAL);

    LOCK_AT.forEach((lockAt, index) => {
      this.later(() => this.overshootReel(index), lockAt - 110);
      this.later(() => this.lockReel(index), lockAt);
    });

    this.later(() => this.finishDraw(finalNumber), LOCK_AT[REEL_COUNT - 1]);
  }

  activateReel(index) {
    const activeReels = this.data.activeReels.slice();
    activeReels[index] = true;
    this.assign({ activeReels });
    this.sync();
  }

  advanceReels() {
    const rollingDigits = this.data.rollingDigits.slice();
    this.data.activeReels.forEach((active, index) => {
      if (active && !this.data.lockedReels[index]) {
        rollingDigits[index] = String(Math.floor(Math.random() * 10));
      }
    });
    this.assign({ rollingDigits });
    this.syncDigits();
  }

  overshootReel(index) {
    const rollingDigits = this.data.rollingDigits.slice();
    rollingDigits[index] = String((Number(this.finalDigits[index]) + 1) % 10);
    this.assign({ rollingDigits });
    this.syncDigits();
  }

  lockReel(index) {
    const rollingDigits = this.data.rollingDigits.slice();
    const lockedReels = this.data.lockedReels.slice();
    rollingDigits[index] = this.finalDigits[index];
    lockedReels[index] = true;
    this.assign({ rollingDigits, lockedReels });
    this.sync();
    vibrate(10);
  }

  finishDraw(finalNumber) {
    this.clearRollingTimer();
    this.assign({ drawn: true, finalNumber });
    this.sync();

    this.later(() => { this.assign({ reveal: true }); this.sync(); }, 300);
    this.later(() => { this.assign({ focusNumber: true }); this.sync(); }, 450);
    this.later(() => { this.assign({ showResultText: true, running: false }); this.sync(); }, 900);
    this.later(() => { this.assign({ reveal: false }); this.sync(); }, 1800);
    vibrate(24);
  }

  randomDigits() {
    return String(Math.floor(Math.random() * 10000)).padStart(4, '0').split('');
  }

  clearRollingTimer() {
    if (this.rollingTimer) {
      clearInterval(this.rollingTimer);
      this.rollingTimer = null;
    }
  }

  openRules() {
    this.router.navigateTo('/lottery-rules');
  }

  /* ---------- 渲染 ---------- */

  statusText() {
    if (this.data.running) return '好运正在汇聚，请稍候';
    if (this.data.drawn) return '您的抽奖码已经生成，等待开奖。';
    return '请提前抽取您的专属号码，并静候会场开奖。';
  }

  buttonText() {
    if (this.data.requesting) return '正在连接 ···';
    if (this.data.running) return '摇号中 ···';
    if (this.data.drawn) return '号码已抽取';
    return '抽取号码';
  }

  syncDigits() {
    const numbers = this.$$('.reel-number');
    this.data.rollingDigits.forEach((digit, index) => {
      if (numbers[index] && numbers[index].textContent !== digit) numbers[index].textContent = digit;
    });
  }

  /** 把状态同步到已有节点，保持动画不被打断 */
  sync() {
    const page = this.$('.page');
    if (!page) return;

    page.classList.toggle('is-running', this.data.running);
    page.classList.toggle('is-drawn', this.data.drawn);

    const machine = this.$('.slot-machine');
    machine.classList.toggle('is-revealing', this.data.reveal);
    machine.classList.toggle('is-focused', this.data.focusNumber);

    this.$$('.reel').forEach((reel, index) => {
      reel.classList.toggle('active', !!this.data.activeReels[index]);
      reel.classList.toggle('locked', !!this.data.lockedReels[index]);
    });
    this.syncDigits();

    this.$('.result-seal').hidden = !this.data.drawn;

    const status = this.$('.status-copy');
    status.textContent = this.statusText();
    status.classList.toggle('success', !this.data.running && this.data.drawn);
    status.classList.toggle('visible', this.data.showResultText);

    const button = this.$('.draw-button');
    button.textContent = this.buttonText();
    button.disabled = this.data.requesting || this.data.running || this.data.drawn;
    button.classList.toggle('pressed', this.data.buttonPressed);
  }

  afterRender() {
    this.sync();
  }

  template() {
    return html`
      <div class="page-scroll">
        <div class="page">
          <div class="ambient ambient-one"></div>
          <div class="ambient ambient-two"></div>

          <div class="marine-hero">
            <img class="ship-visual" src="assets/lottery-shipyard-v2.jpg" alt="" />
            <div class="ship-shade"></div>
            <div class="spotlight"></div>
            <div class="masthead">
              <div class="title">幸运抽奖</div>
              <div class="title-gem"></div>
              <div class="subtitle">LUCKY DRAW CEREMONY</div>
            </div>
          </div>

          <div class="ticket">
            <div class="ticket-line top"></div>
            <div class="ticket-kicker">EXCLUSIVE LUCKY CODE</div>
            <div class="ticket-title">专属抽奖码</div>
            <div class="ticket-rule"><div></div></div>

            <div class="slot-machine">
              <div class="slot-topline">
                <div class="slot-bolt"></div>
                <span>LUCKY NUMBER · 4 DIGITS</span>
                <div class="slot-bolt"></div>
              </div>
              <div class="reels">
                ${this.data.rollingDigits.map((digit, index) => html`
                  <div class="reel reel-${index}">
                    <div class="reel-glass"></div>
                    <div class="reel-lamp"></div>
                    <div class="reel-number">${digit}</div>
                    <div class="reel-tick top"></div>
                    <div class="reel-tick bottom"></div>
                  </div>
                `)}
              </div>
              <div class="slot-baseline">
                <span>PORT</span><div></div><span>STARBOARD</span>
              </div>
              <div class="result-seal" hidden>LUCKY</div>
            </div>

            <div class="status-copy">${this.statusText()}</div>

            <button type="button" class="draw-button" data-tap="startDraw">${this.buttonText()}</button>
            <div class="one-chance">号码已预先生成，动画仅作揭晓展示</div>
            <div class="rules-link tap" data-tap="openRules">查看《抽奖活动说明》</div>
            <div class="ticket-line bottom"></div>
          </div>
        </div>
      </div>
    `;
  }
}
