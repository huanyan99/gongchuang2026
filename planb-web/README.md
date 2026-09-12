# Plan B 网页版

微信小程序的独立手机网页版本，用于无法使用小程序时的备份通道。
目标是**与小程序一比一还原**：同样的页面、同样的尺寸、同样的动效与状态流转，
同时用网页自己的方式实现（原生 ES Module + CSS，无构建、无框架、无第三方依赖）。

## 本地运行

```bash
python3 -m http.server 4173 --directory planb-web
```

浏览器访问 <http://127.0.0.1:4173>。
页面使用 ES Module，必须通过 HTTP 打开，直接双击 `index.html`（file://）不会生效。

默认 `config.js` 中 `demoMode: true`，全部数据保存在浏览器 localStorage，无需后端即可走通全流程。

### 演示模式完整流程

1. 首页 → 「我的邀请」→ 任一场次「转发邀请」，会把邀请链接复制到剪贴板（形如 `?code=SH2026`）
2. 打开该链接：首页场次被锁定为受邀城市，「参会登记」可用
3. 填写并提交登记 → 状态变为「审核中」
4. 「我的邀请」→「查看邀请列表」→「审核通过」
5. 首页出现金色受邀条，底部「抽奖码」可抽号；「参会服务」四项解锁
6. 审核后台入口：`#/admin`，演示模式下任意密钥可进入
7. 在审核后台「桌位批量导入」粘贴或选择 CSV 导入桌号后，首页 →「参会服务」→「桌位图」即可看到自己的桌位

## 一比一还原的实现方式

### 1. 尺寸：1px === 1rpx

`index.html` 里 `.stage` 是一块固定 750 宽的设计稿画布，
由 `src/core/viewport.js` 计算 `--scale = 设备宽度 / 750`，通过 CSS `zoom` 整体缩放。

- 样式文件里的所有长度单位都直接写 `px`，且数值与 wxss 的 `rpx` **完全一致**，不需要任何换算
- `zoom` 是真实布局缩放（不同于 `transform: scale`），文字清晰、滚动与定位正常
- 需要注意的三处换算已统一处理：
  - wxss 的 `100vh` → `100%`（`.stage` 已是视口高度）
  - `env(safe-area-inset-bottom)` → `var(--safe-bottom)`（zoom 内不会自动换算，由 JS 探针换算后注入）
  - wxss 的 `position: fixed` → 页面容器内的 `position: absolute`（小程序的 fixed 本就以页面为参照）

实测：首页 hero 702×430、weather-badge 156×118、底部导航 132+12+12、抽奖转轮 126 高，
换算回设计稿单位后与 wxss 数值逐项一致。

### 2. 结构：设备框 + 页面栈

```
.device            固定视口的手机画幅（移动端铺满，桌面端居中 430×932 卡片）
└ .stage           750 设计稿画布，zoom 缩放
  ├ .nav-bar       还原小程序导航栏（88 高 = 44pt），标题/背景/文字色取自各页 json
  ├ .stage-body    页面栈容器，navigateTo 推入、navigateBack 弹出并保留上一页滚动位置
  └ .stage-layer   Toast / Modal / 底部选择器 / 图片预览
```

页面切换动效对齐小程序的右侧推入，并遵循 `prefers-reduced-motion`。

### 3. 代码组织

```
index.html              页面骨架（导航栏、页面容器、弹层容器）
config.js               运行时配置（apiBase / demoMode / token）
src/
  main.js               注册路由、同步导航栏
  core/
    viewport.js         设计稿缩放与安全区换算
    router.js           哈希路由 + 页面栈（navigateTo / redirectTo / navigateBack）
    view.js             页面基类：生命周期、setData、事件委托、重绘保留滚动与焦点
    dom.js              html 标签模板（默认转义）、when / cx
    api.js              请求层，语义对齐小程序 app.js（code===0、1001 重登、silent）
    demo-api.js         演示后端，接口路径/字段/错误码对齐 backend/
    storage.js          localStorage 封装，键名与小程序一致
    ui.js               Toast / Modal / 底部选择器 / 图片预览 / 复制 / 震动
  pages/*.js            与小程序 pages/* 一一对应
styles/*.css            与小程序各页 wxss 一一对应
```

### 4. 文件对应关系

| 小程序 | 网页版 |
| --- | --- |
| `pages/index` | `src/pages/home.js` + `styles/home.css` |
| `pages/apply` | `src/pages/apply.js` + `styles/apply.css` |
| `pages/lottery` | `src/pages/lottery.js` + `styles/lottery.css` |
| `pages/login` | `src/pages/login.js` + `styles/login.css` |
| `pages/invitations`、`pages/invitation-list` | `src/pages/invitations.js`、`src/pages/invitation-list.js` + `styles/invitations.css` |
| `pages/seat` | `src/pages/seat.js` + `styles/seat.css` |
| `pages/admin` | `src/pages/admin.js` + `styles/admin.css` |
| `pages/agreement`、`pages/privacy`、`pages/lottery-rules` | `src/pages/policy.js` + `styles/policy.css` |
| `pages/invitation-letter`、`pages/agenda`、`pages/route` | `src/pages/service.js` + `styles/service.css` |
| `app.wxss`（page-scroll、组件默认样式） | `styles/base.css` |
| 首页/个人中心重复的底部导航 | `styles/bottom-nav.css`（合并为一份） |

### 5. 样式维护约定

- 每个页面样式加 `.view--<页面名>` 作用域前缀，等价于小程序按页面自动作用域
- 全局保留类名：`.device`、`.stage`、`.stage-body`、`.stage-layer`、`.view`、`.page-scroll`、`.nav-bar`、`.tap`，页面样式不要复用这些名字
- 标签映射：`view` → `div`、`text` → `span`、`image` → `img`，选择器同步替换，DOM 层级与 wxml 保持一致
- 小程序组件默认样式（button / input / textarea / image）在 `base.css` 中用 `:where(.stage)` 声明，
  优先级等同元素选择器，页面样式可直接覆盖，不需要 `!important`
- 小程序里未被 wxml 使用的死样式（如 `.hero-code`、`.qr-grid`、旧入场码二维码相关）未移植

## 桌位图与批量导入

- 嘉宾端：首页 →「参会服务」→「桌位图」（与其他参会服务一样，仅审核通过后可进入）。
  页面顶部是金色「我的桌号」卡片（含同行人桌号），下方是全场桌位图，自己的桌位高亮，
  点击任意桌位查看详情；出于个人信息保护，其他桌位只显示就座人数。
- 管理端：审核后台 →「桌位批量导入」。可以选择 CSV/TXT 文件，或直接从 Excel 复制粘贴。
  文件按 UTF-8 解析，失败时自动按 GBK 重试（Excel 导出的中文 CSV 常见编码）。
- 导入格式：每行 `姓名,手机号,桌号[,座位号]`，首行表头自动跳过；
  逗号、分号、制表符均可作分隔符，没有分隔符时按空白切分。
- 导入方式：`合并更新` 按手机号更新或新增；`覆盖该场次` 先清空该场次再导入。
- 匹配规则：按「场次 + 手机号」与参会登记中的同行人手机号对应，单次最多 2000 条，
  逐行校验，不合法的行会跳过并在结果中给出行号。

## 接入正式后端

修改 `config.js`：

```js
window.PLANB_CONFIG = {
  apiBase: 'https://api.example.com',
  demoMode: false,
  token: '',          // 网页身份认证换取到的 token
};
```

接口路径、请求体、错误码与小程序完全一致，后端无需改动，但需要注意：

- **身份认证**：浏览器没有 `wx.login`。正式环境应接入微信公众号 OAuth、短信验证码或企业统一身份认证，
  换取后端 token 后写入 `config.token` 或 localStorage 的 `bochu:token`；否则请求会以 1001 失败。
- **跨域**：后端需要为网页域名放通 CORS（含 `Authorization`、`X-Admin-Key` 请求头）。
- **HTTPS**：剪贴板、Web Share 等能力要求安全上下文。

## 与小程序能力不同的地方

浏览器没有对应能力，已用最接近的网页方案实现，界面与动线保持不变：

| 小程序能力 | 网页版处理 |
| --- | --- |
| `wx.login` / `getPhoneNumber` 手机号授权 | 登录按钮只建立会话，手机号在参会登记中手动填写 |
| `picker` 滚轮选择器 | 底部选择器（同样的触发器样式，单击即选） |
| `open-type="share"` 转发 | Web Share API，不可用时复制邀请链接 |
| 小程序码 | 后端已配置时展示图片预览，否则提示改用转发邀请 |
| `wx.scanCode` 扫码入场核验 | 审核后台改为手工录入入场凭证 / 手机号 |
| 下拉刷新 | 未实现（页面进入与操作后自动刷新） |

## 字体

与小程序一致，只调用系统字体（`-apple-system` / `PingFang SC` / `Microsoft YaHei` / `Georgia`），
不打包字体文件、不通过 `@font-face` 或 CDN 加载，符合仓库根目录 `FONT_USAGE.md` 的结论。

## 浏览器支持

依赖 CSS `zoom`（Chrome / Edge / Safari 全版本支持，Firefox 126+）、ES Module、CSS `:where()`。
移动端 Safari / Chrome / 微信内置浏览器均可正常显示。
