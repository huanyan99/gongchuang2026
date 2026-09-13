/**
 * 桌位图现场通道：扫会场二维码进入（链接带 pass 参数，长期有效、提前不公布）。
 * 只核对姓名即可查看自己的桌位，不需要手机号登录；同名多人时再补手机号后四位。
 * 抽奖码不走这里，仍需手机号 + 姓名正常登录。
 */

import { View } from '../core/view.js';
import { html, when } from '../core/dom.js';
import { passLogin } from '../core/api.js';
import { toast } from '../core/ui.js';

export class PassView extends View {
  static meta = { title: '现场通道', background: '#0d214d', textStyle: 'white' };

  constructor(options) {
    super(options);
    this.data = {
      pass: '',
      name: '',
      phoneTail: '',
      needPhoneTail: false,
      submitting: false,
    };
  }

  onLoad(options) {
    this.setData({ pass: options.pass || '' });
  }

  onNameInput(event) {
    this.assign({ name: event.target.value });
  }

  onPhoneTailInput(event) {
    const digits = event.target.value.replace(/\D/g, '').slice(0, 4);
    event.target.value = digits;
    this.assign({ phoneTail: digits });
  }

  submit() {
    if (this.data.submitting) return;
    const name = String(this.data.name || '').trim();
    if (!name) return toast('请输入姓名');
    if (!this.data.pass) return toast('通道参数缺失，请重新扫码');
    if (this.data.needPhoneTail && String(this.data.phoneTail || '').length !== 4) {
      return toast('请输入手机号后四位');
    }

    this.setData({ submitting: true });
    passLogin(this.data.pass, name, this.data.phoneTail)
      .then((result) => {
        if (result && result.needPhoneTail) {
          this.setData({ needPhoneTail: true });
          toast('有同名嘉宾，请补手机号后四位');
          return;
        }
        this.router.redirectTo('/seat');
      })
      .catch(() => {})
      .finally(() => this.setData({ submitting: false }));
  }

  template() {
    return html`
      <div class="page-scroll">
        <div class="pass-page">
          <div class="pass-hero">
            <div class="eyebrow">ON-SITE ACCESS</div>
            <div class="title">现场通道</div>
            <div class="sub">核对姓名后即可查看您的桌位</div>
          </div>

          <div class="pass-card">
            <div class="label">姓名</div>
            <input class="pass-input" name="passName" maxlength="32" value="${this.data.name}"
                   placeholder="请输入姓名" data-input="onNameInput" />
            ${when(this.data.needPhoneTail, () => html`
              <div class="label tail">手机号后四位</div>
              <input class="pass-input" name="phoneTail" type="tel" inputmode="numeric" maxlength="4"
                     value="${this.data.phoneTail}" placeholder="用于区分同名嘉宾" data-input="onPhoneTailInput" />
            `)}
          </div>

          <button type="button" class="pass-btn primary" ${this.data.submitting ? 'disabled' : ''} data-tap="submit">
            ${this.data.submitting ? '核对中' : '进入'}
          </button>
        </div>
      </div>
    `;
  }
}
