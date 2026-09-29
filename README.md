# 微信小程序 + Java 后端

## 目录结构

```
wechat-app/          微信小程序前端（用微信开发者工具打开此目录）
  project.config.json
  miniprogram/
    app.js           全局逻辑：启动登录、统一请求封装
    app.json / app.wxss / sitemap.json
    pages/index/     首页（示例：调用后端 /api/hello）
    pages/login/     登录页（示例：wx.login + 后端换取 openid）
    utils/
backend/             Spring Boot 3.2 后端（Java 17 + Maven + MyBatis + MySQL）
  src/main/java/com/example/app/
    controller/  接口层
    service/     业务层
    mapper/      MyBatis Mapper
    entity/ dto/ exception/ config/
  src/main/resources/
    application.yml   配置（数据库、微信 appid/secret）
    db/schema.sql     建库建表脚本
planb-web/           Plan B 网页版（小程序的一比一网页复刻，无构建依赖，见 planb-web/README.md）
```

## 后端启动

1. 先创建数据库：`mysql -u root -p < backend/src/main/resources/db/schema.sql`
2. 修改 `backend/src/main/resources/application.yml` 中的数据库账号密码
3. 在 `application.yml` 填入微信小程序的 `appid` 和 `secret`（小程序后台 → 开发管理 → 开发设置）
4. 启动：
   ```powershell
   cd backend
   mvn spring-boot:run
   ```
5. 验证：访问 http://localhost:8080/api/hello

## 小程序启动

1. 用微信开发者工具「导入项目」选择 `wechat-app` 目录，填入你的 AppID（测试号也可以）
2. 详情 → 本地设置 → 勾选「不校验合法域名」（开发阶段 http://localhost 可用）
3. 首页会显示后端返回的 `Hello from backend`

## 主要接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/hello | 联调示例 |
| POST | /api/auth/login | 小程序登录（body: { code }） |
| POST | /api/auth/phone-hint | 手机号在登记中的姓名掩码（登录时补全姓名核验） |
| POST | /api/auth/profile/verify | 已登录用户补全姓名核验并回填档案 |
| GET | /api/seat/me | 我的桌位（需登录且登记已审核通过；场次未开放时不下发桌位） |
| GET | /api/seat/visibility | 场次桌位图是否对嘉宾开放（公开，只回布尔） |
| POST | /api/admin/login | 后台账号口令登录，返回会话 token |
| POST | /api/pass/session | 现场通道换会话（扫码 + 姓名） |
| POST | /api/admin/passes | 生成现场通道二维码（需 X-Admin-Token） |
| POST | /api/admin/users/{id}/reset-device | 解绑用户设备（需 X-Admin-Token） |
| GET、POST | /api/admin/settings | 后台开关读取与修改（需 X-Admin-Token） |
| GET | /api/admin/seats/board | 桌位分配看板：人员名单 + 桌位定义 + 场次版本号（需 X-Admin-Token） |
| POST | /api/admin/seats/board | 保存桌位分配，带版本号，冲突返回 1003（需 X-Admin-Token） |

## 桌位图

嘉宾在「参会服务 → 桌位图」查看桌号，本人与每位同行人各一张卡片。
接口只下发本人及同行人的桌号，不返回其他嘉宾信息。

会务在「审核后台 → 桌位分配」打开分配看板（**电脑端**）：

- 左侧是按公司分组的参会人名单（只含本场次审核通过的登记），右侧是桌位卡片
- 把人员拖到桌位上即完成分配；也可以「点人 → 点桌位」；点成员上的 × 退回未分配
- 可新增桌位、改桌号、删桌（删桌时桌上的人自动退回未分配，会先二次确认）
- 点保存提交整份「最终状态」，带场次版本号：期间有其他管理员改过就会被拒绝并要求重新加载
- 数据表：桌位定义在 `gonghcuang_table`，人坐哪桌在 `gonghcuang_seat`（嘉宾端只读这张表）
- 新库见 `db/schema.sql`；老库先执行 `db/migrate_v9_seat.sql`（若未执行）再执行 `db/migrate_v17_seat_board.sql`
- 小程序后台只提供统计与「请用电脑端分配」提示

每个场次的桌位图是否对嘉宾显示，由后台「安全设置」的三个开关控制
（`seat_visible_foshan` / `seat_visible_jinan` / `seat_visible_shanghai`，默认佛山、济南开，上海关）。
关闭时嘉宾端显示「暂未更新~」，与开关上线前的表现一致；改完立即生效，无需重启。

## 数据库与本地运行

- 后端连真实 MySQL，本地连接与口令写在 `backend/config/application-local.yml`（已 gitignore，不进仓库），
  `application.yml` 通过 `spring.config.import: optional:file:./config/application-local.yml` 自动加载。
- 建表：把 `db/schema.sql` 在目标库执行一次即可（全部 `CREATE TABLE IF NOT EXISTS`，可重复执行）。
- 网页版不再有演示模式，只连真实后端：`planb-web/config.js` 的 `apiBase` 指向后端地址，同源部署时留空。

## 登录与身份

- 登录分两步：手机号 → 姓名。手机号已在参会登记中出现过时，第二步不再要求填写姓名和性别，
  只需补全姓名中隐藏的第二个字（两字姓名即末字，三字及以上即中间字，与银行转账核验一致），
  姓名与登记不一致则拒绝登录，核验通过后由后端按登记信息回填姓名与性别。
- 一个账号一台设备：客户端首次登录生成设备识别码存在本机，随请求头 `X-Device-Id` 上送，
  第二台设备登录返回错误码 1004。是否限制由后台两个开关分别控制（见下）。
- 数据表变更：`gonghcuang_user.device_id` 与 `gonghcuang_setting`，
  新库见 `db/schema.sql`，老库执行 `db/migrate_v10_device_setting.sql`。

## 登录态

- 嘉宾登录 token 有效期 60 天，期间不做任何清理；个人中心「退出登录」调用
  `POST /api/auth/logout` 作废后端 token，并清掉本机身份缓存（设备识别码保留）。
- 后台会话 8 小时过期，登录成功会作废该账号的其他会话。

## 管理后台账号

- 后台改为账号口令登录：`POST /api/admin/login` 拿会话 token，其余管理接口放在请求头 `X-Admin-Token`。
  原先的 `X-Admin-Key` 已移除。
- 口令用 PBKDF2-HMAC-SHA256（21 万次迭代）加随机盐存储；会话 token 只存 SHA-256 摘要，
  有效期 8 小时，登录成功会作废该账号的旧会话。
- 连续 5 次口令错误锁定账号 15 分钟；同一 IP 10 分钟内超过 20 次尝试直接拒绝；
  登录失败信息不区分「账号不存在」与「口令错误」。新口令要求 ≥12 位且含字母、数字、符号。
- 首次启动且库里没有账号时，用 `application.yml` 的 `admin.bootstrap-username/password` 建一个管理员，
  登录后请立刻改密（`POST /api/admin/password`），正式环境建议用环境变量注入并在建号后清空该配置。

## 三种二维码

`app.web-base-url` 配置网页版地址后，后台可直接生成二维码图片：

| 二维码 | 内容 | 打开后 |
| --- | --- | --- |
| 首页 | 网页地址 | 正常首页；核验是否有受邀场次（贵宾席），未登录点功能入口跳登录 |
| 抽奖码 | `<网页地址>/#/lottery` | 未登录先用手机号 + 姓名登录，登录后回到抽奖页 |
| 桌位图现场通道 | `<网页地址>/?pass=<随机串>#/pass` | 只核对姓名 → 桌位图；同名多人补手机号后四位 |

- 前两种不含密钥，随便贴；桌位图通道的 `pass` 是不可猜的随机串，长期有效、提前不公布
- 通道会话只能访问 `/api/seat/**`（有效期 12 小时），访问抽奖码或参会登记会被拒绝
- 通道可随时停用，停用后已扫码的会话立即失效

## 设备限制开关

- 「审核后台 → 安全设置」两个开关：邀请人（默认开启）与普通嘉宾（默认关闭）
- 后端每次登录实时读库，后台改完即刻生效，不需要重启
- 换设备由管理员调用 `POST /api/admin/users/{id}/reset-device` 解绑

## 登录与设备审计

- 审核后台的「用户设备管理」可以按用户解绑设备，并查看最近登录、设备冲突和管理员解绑记录。
- 解绑会同时作废该用户当前 token；用户下一次登录时重新绑定当前设备。
- 设备标识只保存 SHA-256 摘要的前 16 位，不保存客户端原始设备标识。
- 已有数据库升级时执行 `backend/src/main/resources/db/migrate_v12_login_audit.sql`，只新增审计表，不清空已有数据。

## 上海登记同步至企业微信智能表格

后台可每 5 分钟把上海场登记同步到企业微信智能表格的「上海登记同步」子表，每位参会人一行，包含审核状态、入场核验和扫码签到状态及次数。同步编号由登记编号和参会人编号组成，重复运行会更新已有记录；内容没有变化时跳过。同步失败只写后台日志，登记、审核和签到接口不等待企业微信。

在 `backend/config/application-local.yml` 或环境变量中配置 `WECOM_CORP_ID`、`WECOM_APP_SECRET`、`WECOM_SHEET_ENABLED=true`。应用需有该文档的智能表格调用权限。程序会自动创建「上海登记同步」子表和文本列；如已手动创建该子表，可设置 `WECOM_SHEET_ID` 指定其 ID。未配置凭据时同步保持关闭。

## 参会登记防重与审核同名提醒

- 新提交/修改登记时，任一参会人「姓名 + 公司」与已有登记（主联系人或同行人，忽略大小写和首尾空格）相同即拒绝提交，提示「该姓名和公司已有参会登记」；同一份登记内部重复的姓名+公司同样拒绝。修改登记时保留自己原有的组合不受影响。
- 老库升级先执行 `backend/src/main/resources/db/migrate_v16_registration_identity.sql`：只建并发占位表，不回填历史数据，存量重复不影响上线；新登记的并发提交由该表唯一键兜底。
- 审核列表对每份登记标注 `duplicateNames`：参会人姓名出现在其他登记中、或同一份登记内多位参会人同名时，待审核卡片和 PC 表格会显示「同名提醒」，提示人工核对。

## 嘉宾扫码签到

- 老库先执行 `backend/src/main/resources/db/migrate_v15_attendance.sql`，再部署后端和 `planb-web`。
- 后台「入口与通道 → 入口二维码 → 签到码」生成 `/#/checkin` 二维码，使用 `app.web-base-url`。
- 嘉宾扫码并登录后，页面照常进入首页，同时仅为手机号匹配且审核通过的本人静默签到；同行人各自签到。
- 每次打开签到入口成功提交新增一条记录，再次扫码或刷新该页也会新增记录，页面内部重绘不重复提交。
- 后台「签到管理」刷新每人状态、次数和时间，分页查看每次记录；导出名单包含签到状态、次数、首次及最近签到时间。
- 与原工作人员「入场核验」独立，历史入场记录不会自动算作扫码签到。
