# AGENTS.md

柏楚 2026 价值共创峰会会务系统（佛山 / 济南 / 上海三场）。受邀嘉宾用邀请码登记参会，
审核通过后领取抽奖码、查看桌位，现场扫码签到；会务人员用审核后台管理登记、邀请码、
桌位、签到、二维码与开关。

本文件是给在此仓库工作的 AI/开发者读的项目说明。动代码前请先读第 5 节「业务不变量」与第 6 节「改动约定」。

## 1. 仓库结构

| 目录 | 内容 | 技术栈 |
| --- | --- | --- |
| `backend/` | REST API、业务逻辑、数据库脚本，唯一数据源 | Java 17 · Spring Boot 3.2.5 · MyBatis-Plus 3.5.7 · MySQL 5.7 |
| `wechat-app/` | 微信小程序，用微信开发者工具直接打开此目录 | 原生小程序（无 npm 依赖） |
| `planb-web/` | Plan B 网页版，小程序不可用时的备份通道 | 原生 ES Module + CSS，无构建、无框架、无第三方依赖 |
| `README.md` | 功能与部署说明，改动功能后同步更新 | |
| `backend/GROUP_REGISTRATION.md` | 同组登记与抽奖码规则 | |
| `FONT_USAGE.md` | 字体授权政策与准入规则 | |

规模参考：后端 ~5.0k 行 92 文件，网页版 ~9.1k 行，小程序 ~8.6k 行。

## 2. 常用命令

```powershell
# 后端本地运行（端口 4556，默认 profile 连本地 MySQL）
cd backend; mvn spring-boot:run

# 后端测试（当前全绿；不需要本地 MySQL）
cd backend; mvn test

# 网页版本地（默认 4555，把 /api/* 反代到 http://127.0.0.1:4556，同源无跨域）
python planb-web/dev-server.py                 # 可传端口与后端地址：dev-server.py 4555 http://127.0.0.1:4556

# 纯静态打开网页版（跨域，来源需在 CORS 白名单内）
python -m http.server 4173 --directory planb-web
```

- 数据库：新库执行 `backend/src/main/resources/db/schema.sql`（全部 `CREATE TABLE IF NOT EXISTS`，可重复执行）；
  老库按编号顺序执行 `db/migrate_vN_*.sql`（当前最高 v17，桌位看板重建）。
- 本地数据库账号口令放 `backend/config/application-local.yml`（已 gitignore，由 `spring.config.import` 可选加载）。
- 小程序：微信开发者工具「导入项目」选 `wechat-app`，详情 → 本地设置 → 勾选「不校验合法域名」。
- 测试 Profile：默认（无 `spring.profiles.active`）= MySQL；`dev` = H2 内存库（`schema-h2.sql`）；
  `mysql-test` / `prod` 见 `backend/src/main/resources/application-*.yml`。

## 3. 后端约定

分层：`controller → service → mapper(MyBatis-Plus BaseMapper) → entity`；
`dto` 放入参，`common` 放 `Result` / `ErrorCode` / `BizException` / `ApplyStatus`，
`config` 放拦截器与 `UserContext`。业务逻辑一律写在 service，controller 只做参数校验与组装。

- **统一响应**：`Result<T>{code,message,data}`，`code === 0` 才是成功，前端据此判断。
  业务失败抛 `BizException(ErrorCode, 可选 detail)`，由 `GlobalExceptionHandler` 转成同一结构（HTTP 仍为 200）。
  新增错误码先加 `ErrorCode` 枚举。
- **错误码段位**：1xxx 通用（1001 未授权 / 1004 设备限制）/ 2xxx 邀请码 / 3xxx 申报与签到 /
  4xxx 抽奖 / 5xxx 桌位 / 9xxx 系统。
- **鉴权**（`AuthInterceptor` + `WebMvcConfig` 的 `addPathPatterns`）：
  - 嘉宾：请求头 `Authorization: <token>`（也接受 `Bearer ` 前缀），token 有效期 60 天，不做定期清理，只有主动退出登录才作废。
  - 现场通道会话：同一个请求头，作用域**只放行 `/api/seat/**`**，其它接口返回 1001。
    新增或调整接口时注意别把通道会话漏进抽奖、登记等接口。
  - 管理端：请求头 `X-Admin-Token`（账号口令登录换来的会话），有效期 8 小时；
    新增 `/api/admin/**` 接口必须调用 `adminAccountService.require(adminToken)`。
    口令用 PBKDF2-HMAC-SHA256（210k 次迭代）+ 每账号随机盐存储；连续 5 次失败锁 15 分钟，
    同 IP 10 分钟 20 次上限；登录成功会作废该账号的其它会话。
  - 设备绑定：请求头 `X-Device-Id`，库里只存摘要前 16 位；第二台设备登录返回 1004。
- **数据库**：所有表 `gonghcuang_` 前缀——这是仓库里既有的拼写，不要"顺手修正"成 `gongchuang`。
  表名下划线转驼峰由 `mybatis-plus.configuration.map-underscore-to-camel-case` 处理。
- **后台开关**都在 `gonghcuang_setting` 表，键名见 `SettingService`：
  `device_binding_guests`（默认关）、`device_binding_inviters`（默认开）、
  `lottery_open_foshan|jinan|shanghai`（默认关）、`seat_visible_foshan|jinan|shanghai`（佛山/济南默认开、上海默认关）。
  开关每次读库、不做进程内缓存，后台改完立即生效；写入走原子 upsert 并记录 `updated_by`。
  新开关必须同时加进 `AdminController.updateSetting` 的白名单，否则会报「未知开关」。
- **并发防护约定**（多管理员协作，改动写接口时必须遵守）：
  - 状态流转用条件更新（`UPDATE ... WHERE id=? AND status=?/edit_count=?`），受影响行数为 0 就抛
    `1003 CONFLICT` 并给出「请刷新后重试」一类的人话提示，不要整行读改写；
  - 「提交最终状态」的批量写（如桌位看板）要带版本号做乐观锁 + 场次级互斥锁；
  - 两台设备/两个人抢同一个资源时，把判断下沉到 SQL（唯一键或 `WHERE` 条件），不要先查后写；
  - 前端收到 1003/3003 要自动刷新列表，并用**行级** pending 状态禁用按钮。
- **配置与密钥**：仓库里不保存任何口令。默认值在 `application.yml`；本地覆盖放
  `backend/config/application-local.yml`（gitignore）；生产用环境变量
  （`application-prod.yml` 要求 `WECHAT_APPID`/`WECHAT_SECRET`，且 `wechat.mock-login` 必须为 false）。
  企微智能表格同步凭据 `WECOM_*`，未配置时同步保持关闭。

## 4. 前端：两套实现必须同步

除「现场通道页」为网页独有、小程序有「邀请函/议程/路线」三个独立页面外，其余功能两端都有，
**改一处必须改另一处**（页面、文案、状态流转、视觉尺寸）。对应关系见 `planb-web/README.md` 的「文件对应关系」表：
`pages/*` ↔ `src/pages/*.js` + `styles/*.css`，`app.wxss` ↔ `styles/base.css`。

**小程序**（`wechat-app/miniprogram`）：
- 请求与登录态集中在 `app.js`（`request` / `ensureLogin`）：`code===0` 判定成功、1001 自动重登重试一次、
  3002（未登记）静默不弹提示；登录态与身份缓存键名（`token`、`authUserId`、`bochuLuckyNumber` 等）两端一致。
- `app.js` 的 `globalData.baseUrl` 是局域网联调地址，换环境必须改；`mockApi` 目前为 false。

**网页版**（`planb-web`）：核心约束是「1px === 1rpx」的一比一还原。
- 所有长度单位直接写 `px`，数值与小程序的 `rpx` 完全一致，不做换算；
  `src/core/viewport.js` 用 CSS `zoom` 整体缩放（`.stage` 是固定 750 宽的设计稿画布），不要换成 `transform: scale`。
- 页面继承 `src/core/view.js` 的 `View`：`template()` 返回整页 HTML，`setData()` 整页重绘
  （自动保留滚动位置与输入焦点，表单页可放心调用）；事件用 `data-tap / data-input / data-change / data-submit`
  委托绑定到同名方法，**不要手动 addEventListener**。
- 用 `src/core/dom.js` 的 `html` 模板（默认转义）与 `when` / `cx`；
  路由是哈希路由 + 页面栈（`navigateTo / redirectTo / reLaunch / navigateBack`），入口 `src/main.js`。
- 每个页面样式加 `.view--<页面名>` 作用域前缀；`.device / .stage / .stage-body / .stage-layer / .view /
  .page-scroll / .nav-bar / .tap` 是全局保留类名，页面样式不要复用。
- 标签映射 `view→div`、`text→span`、`image→img`，DOM 层级与 wxml 保持一致；
  小程序组件默认样式在 `base.css` 用 `:where(.stage)` 声明，页面样式可直接覆盖，不需要 `!important`。
- `config.js` 是运行时配置（部署后改，不用重新构建）；`index.html` 里静态资源带 `?v=时间戳` 查询串。
- 审核后台是同一路由里的 `#/admin`，进入时给 `body` 加 `pc-mode` 切宽屏布局（`styles/admin-pc.css`），
  并使用页面外的 `#adminLayer` / `#adminPc` 渲染层。
- 浏览器缺失能力的替代方案见 `planb-web/README.md`「与小程序能力不同的地方」。

## 5. 业务不变量（不要悄悄改掉；确需更改时同步 README）

- **登录两步**：手机号 → 姓名。手机号曾在登记中出现过时，只让补姓名里隐藏的第二个字
  （两字姓名 = 末字，≥3 字 = 中间字，与银行转账核验一致，见 `AuthService.maskName`/`missingCount`），
  补错即拒绝，通过后按登记信息回填姓名与性别。
- **一个账号一台设备**：由两个开关分别控制邀请人（默认开）与普通嘉宾（默认关）；
  解绑走 `POST /api/admin/users/{id}/reset-device`，解绑同时作废该用户当前 token。
- **三种二维码**：首页码（不含密钥）、抽奖码（`#/lottery`）、现场通道（`?pass=<随机串>`，
  长期有效、可随时停用，会话只能看桌位）。
- **抽奖码**：四位 = 场次前缀（佛山 1 / 济南 6 / 上海 8）+ 三位后缀，后缀规避数字 4，每场 729 个；
  `gonghcuang_lottery_draw` 有 `unique(lucky_code)` 兜底，碰撞重试。号码在注册时预生成，
  但**领取时**按登记对应场次的开关实时校验（关闭返回 4003）；已发号码看不出、不换号。
  号码挂在 `user_id` 上，同组登记的同行人各自持有自己的号码。
- **登记防重**：姓名 + 公司（忽略大小写与首尾空格）在任意已有登记中、或同一份登记内重复即拒绝（3008）；
  并发提交由 `gonghcuang_registration_identity` 唯一键兜底。审核列表对同名参会人返回
  `duplicateNames`，前端显示「同名提醒」。
- **同组可见性**：同行人手机号匹配 `gonghcuang_application_guest.phone` 后可查看整组登记与审核状态，
  但 `canEdit` 只对提交人（`application.user_id`）为 true，改接口也会被拒。
- **扫码签到**：每次打开签到入口或刷新增一条记录，页面内部重绘不重复提交；
  与工作人员的历史「入场核验」互不影响，不自动互相计数。
- **桌位图**：接口只下发本人与同行人的桌号，绝不返回其他嘉宾信息。桌位的维护在后台「桌位分配」看板
  （`SeatBoardService`：场次锁 + 版本号 + 单事务全量替换），人员只能来自本场次审核通过的登记；
  `gonghcuang_seat` 是嘉宾端唯一读取的表，`gonghcuang_table` 只存桌位定义。
  场次是否对嘉宾开放由 `seat_visible_*` 开关决定，嘉宾端先查公开接口 `/api/seat/visibility` 再决定是否请求桌位。
  （历史遗留的「全场位置图 / hallImages」已删除，不要再加回来。）
- **字体**：只调用设备系统字体，禁止引入、打包字体文件或通过 CDN 加载（`FONT_USAGE.md`）。
- **场次归属**：首页场次标签与参会服务由同一优先级决定（两端各自的 `applyVenue`：
  已审核登记 > 未审核登记/有效邀请码 > 都没有则不锁定并置灰参会服务），两端逻辑必须一致。

## 6. 改动约定

1. **改表结构**：同时给新库脚本 `db/schema.sql` 与老库增量迁移 `db/migrate_vN_<描述>.sql`
   （当前最高 v17）；`CREATE` 要写成可重复执行，`ALTER` 在 MySQL 5.7 下做不到幂等，文件头要注明只执行一次。
2. **改接口**：后端 + 小程序 + 网页版一起改，并更新根 `README.md` 的接口表与相关说明。
3. **改前端**：两端同步；网页版遵守第 4 节的 px/zoom 与 `View` 基类约定。
4. **提交前**：`cd backend && mvn test`。涉及 service 逻辑的改动补 `backend/src/test` 的单测，
   风格对齐现有测试（纯 Mockito、mock mapper、无 Spring 上下文；需要数据库的用 `@SpringBootTest` + `@ActiveProfiles("dev")`）。
5. 这是中文项目：注释、提示文案、文档都用中文；表名与字段保留既有拼写；不引入前端构建工具或第三方依赖
   （网页版刻意保持零依赖）。

## 7. 容易踩的坑

- `wechat-app/miniprogram/app.js` 的 `globalData.baseUrl` 当前是 `http://10.1.101.250:8080`，
  与本机后端端口 4556 不一致，本地联调必须先改。
- 少量注释/文档仍写着已废弃的 `X-Admin-Key`（`planb-web/src/core/api.js` 注释、
  小程序 `pages/admin/index.js` 的说明），实际请求头是 `X-Admin-Token`；顺手更正即可，不要照抄。
- **数据库是 MySQL 5.7.38**：没有 `REGEXP_REPLACE`、没有 `ADD COLUMN IF NOT EXISTS`；
  `STRICT_TRANS_TABLES` 下 `INSERT ... SELECT CAST('10号桌' AS UNSIGNED)` 会报 1292，
  种子数据要临时放宽 `sql_mode`（见 `migrate_v17_seat_board.sql`）。
- **前端 JS 文件是 CRLF**：用脚本批量改动时按 `\r\n` 处理，否则匹配不到。
- **改了前端一定要升版本串**：`index.html` 的 `?v=时间戳`（以及 `src/main.js` 里两个页面模块的 import）就是这个项目唯一的缓存失效手段。
  改了 `styles/*.css`、`src/pages/*.js`、`src/core/*.js` 却不升版本号，浏览器会继续用旧文件——
  已经踩过一次：桌位看板改了 CSS 但版本串没动，页面上仍是旧样式（表现为卡片高度被行高钉死、内容被下一行盖住）。
- **弹层有两套栈，别混用**：`ui.js` 的 `toast/showModal` 挂在 `#stageLayer`（z-index 200，在手机画布内），
  而脱离画布的整屏浮层（如桌位分配看板 `.sb-mask`，z-index 300）会**盖住**它们——手机后台模式下点了像没反应。
  整屏浮层要用自己的对话框与提示（见 `seat-board.js` 的 `dialog()/flash()`）。
- **`ui.css` 的 `.modal/.toast` 是 750 设计稿尺寸**（靠手机画布的 zoom 缩小）。电脑模式的弹层在
  `#adminLayer` 里没有 zoom，直接用会大出一倍，所以 `admin-pc.css` 里有一组 `body.admin-pc-open #adminLayer` 的尺寸覆盖；
  新增弹层样式时记得两边都考虑。
- 端口：后端 4556；`planb-web/dev-server.py` 默认 4555 并把 `/api` 反代到后端（同源，不需要 CORS）；
  `nginx.conf.example` 是生产同源反代模板（站点 4555 → 后端 127.0.0.1:4556）。
  CORS 白名单由 `app.cors.allowed-origins` 决定（`application.yml` 默认 4555 与 `https://pmt.fscut.com`）。
- 超大文件：`planb-web/src/pages/admin.js`（~61KB）、`ApplicationService.java`（~36KB）、
  `planb-web/src/pages/home.js`、`AuthService.java`。改动尽量局部，不要顺手重构。
- 时间与编码：Jackson 时区固定 `Asia/Shanghai`；Windows 控制台打印中文日志/测试输出会乱码，
  属终端编码问题，不是代码缺陷。
- 桌位批量导入（CSV/文本）与 `/api/admin/seats/import`、`/api/admin/seats` 已在 v17 版本一并删除，
  分配统一走 `/api/admin/seats/board`；不要再按旧文档去恢复导入入口。
