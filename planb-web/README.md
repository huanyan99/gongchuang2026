# Plan B 网页版

微信小程序的独立手机网页版本，用于无法使用小程序时的备份通道。
目标是**与小程序一比一还原**：同样的页面、同样的尺寸、同样的动效与状态流转，
同时用网页自己的方式实现（原生 ES Module + CSS，无构建、无框架、无第三方依赖）。

## 本地运行

### 邀请函海报

请将做好的海报按以下文件名分别放入两个前端目录，文件会随小程序或网页一起打包：

- 原始海报：`planb-web/assets/foshan-invent.png`、`jinan-invent.png`
- 网页优化图：`planb-web/assets/foshan-invent.jpg`、`jinan-invent.jpg`
- 小程序优化图：`wechat-app/miniprogram/images/foshan-invent.jpg`、`jinan-invent.jpg`

打包使用优化后的 JPG，单张控制在 200 KB 内；原始 PNG 仅作设计源文件，不复制进小程序。上海场暂不配置图片。

```bash
python3 -m http.server 4173 --directory planb-web
```

浏览器访问 <http://127.0.0.1:4173>。
页面使用 ES Module，必须通过 HTTP 打开，直接双击 `index.html`（file://）不会生效。

网页版只连真实后端，没有演示数据。本地用自带的开发服务器跑：

```bash
cd backend && mvn spring-boot:run          # 后端，数据库连接在 backend/config/application-local.yml
python3 planb-web/dev-server.py            # 网页 http://127.0.0.1:4173，/api 转发到 8080
```

`dev-server.py` 把接口和网页放在同一个源下，所以 `config.js` 的 `apiBase` 留空即可；
正式部署用 Nginx 按同样方式反代 `/api` 就行。

### 本地联调流程

1. 启动后端：`cd backend && mvn spring-boot:run`
2. 启动网页：`python3 planb-web/dev-server.py`（静态托管 + 把 `/api/*` 转发到后端，
   与网页同源，`config.js` 的 `apiBase` 保持留空即可，也不会有跨域问题）
3. 后台 `#/admin` 用管理员账号登录，给某个用户开邀请权限后，该用户在「我的邀请」里生成各场次邀请码
4. 打开邀请链接 `?code=XXXX` → 参会登记 → 后台审核通过 → 抽奖码、桌位图可用

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
config.js               运行时配置（apiBase / token / 全场位置图）
src/
  main.js               注册路由、同步导航栏
  core/
    viewport.js         设计稿缩放与安全区换算
    router.js           哈希路由 + 页面栈（navigateTo / redirectTo / navigateBack）
    view.js             页面基类：生命周期、setData、事件委托、重绘保留滚动与焦点
    dom.js              html 标签模板（默认转义）、when / cx
    api.js              请求层，语义对齐小程序 app.js（code===0、1001 重登、silent）
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
| （网页独有）现场通道 | `src/pages/pass.js` + `styles/pass.css` |
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
  本人与每位同行人各一张金色桌号卡片，下方是全场位置图。
  接口只下发本人及同行人的桌号，不返回其他嘉宾信息。
- 全场位置图是预留图片位：把图片放进 `assets/`，在 `config.js` 的 `hallImages` 按场次填写路径
  （也可填 https 地址），未配置时显示占位框；点击图片可全屏查看。
- 管理端：审核后台 →「桌位批量导入」。可以选择 CSV/TXT 文件，或直接从 Excel 复制粘贴。
  文件按 UTF-8 解析，失败时自动按 GBK 重试（Excel 导出的中文 CSV 常见编码）。
- 导入格式：每行 `姓名,手机号,桌号`，首行表头自动跳过，多余的列忽略；
  逗号、分号、制表符均可作分隔符，没有分隔符时按空白切分。
- 导入方式：`合并更新` 按手机号更新或新增；`覆盖该场次` 先清空该场次再导入。
- 匹配规则：按「场次 + 手机号」与参会登记中的同行人手机号对应，单次最多 2000 条，
  逐行校验，不合法的行会跳过并在结果中给出行号。

## 登录

全站只有一个登录入口：个人中心。两步向导：

1. 手机号 —— 11 个格子逐位输入
2. 姓名 —— 手机号已在参会登记中出现过时，只显示姓名掩码与一个补字框（张 [ ] 明，隐藏第二个字，
   与银行转账核验一致），补对即登录，性别由登记信息带出；未登记过的手机号仍填写姓名与性别

登录态保留 60 天，期间不会自动失效；个人中心底部的「退出登录」会同时作废后端 token 与本机缓存
（设备识别码保留，同一台设备重新登录不会触发设备限制）。

登录状态只有一个来源：会话 token + 用户手机号。未登录时首页不展示任何个人状态
（登记状态显示「未登记」、不出现受邀场次与我的邀请），点击功能入口会跳到登录页。

页面按需要的登录级别声明 `static auth`，由路由守卫统一拦截：

| 级别 | 页面 |
| --- | --- |
| `full` 正常登录 | 参会登记、我的邀请、邀请列表 |
| `any` 正常登录或现场通道 | 抽奖码、桌位图 |
| 公开 | 首页、协议、参会服务、登录、现场通道 |

三种二维码：

| 二维码 | 内容 | 打开后 |
| --- | --- | --- |
| 首页 | 网页地址 | 正常首页；未登录点功能入口跳登录 |
| 抽奖码 | `#/lottery` | 未登录先走手机号 + 姓名登录，登录后回到抽奖页 |
| 桌位图现场通道 | `?pass=<随机串>#/pass` | 只核对姓名（同名多人补手机号后四位）→ 桌位图 |

前两种不含任何密钥；桌位图通道的 `pass` 参数长期有效、提前不公布，会话在浏览器里标记为
`passScoped`，只能看桌位，访问抽奖码或参会登记会被路由守卫挡回登录页。

首页隐私弹窗已关闭（`config.js` 的 `privacyPopup`），协议入口保留在个人中心底部。

请求统一带 `X-Device-Id`（首次访问生成并存本机），用于后端「一个账号一台设备」限制。

## 会场归属与参会服务

首页的场次标签与参会服务由同一套优先级决定（`home.js` 的 `applyVenue`），两端逻辑一致：

1. 已审核登记 → 锁定该场次
2. 未审核登记 / 有效邀请码 → 锁定该场次
3. 都没有 → 不锁定场次，参会服务整组置灰，点击提示无法查看

有归属才开放参会服务；抽奖码与桌位图另有后端校验，必须审核通过才能取号或看桌位。

## 一键导航

交通路线页的「一键导航」用各家地图的 HTTPS URI 接口（`uri.amap.com`、`apis.map.qq.com`、
`api.map.baidu.com`、`maps.apple.com`），装了 App 会被唤起，没装则回落到网页地图，
微信内置浏览器里也能打开；私有协议（`iosamap://` 等）在微信里会被拦截，所以没有使用。

默认按酒店名称检索。若在 `src/pages/service.js` 的 `VENUES` 中给某个场次补上
`location: { lng, lat }`（GCJ02 坐标），会自动改为直接定点，定位更准。

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
