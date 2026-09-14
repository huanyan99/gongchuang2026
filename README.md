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
| GET | /api/seat/me | 我的桌位与本场桌位图（需登录且登记已审核通过） |
| POST | /api/admin/login | 后台账号口令登录，返回会话 token |
| POST | /api/pass/session | 现场通道换会话（扫码 + 姓名） |
| POST | /api/admin/passes | 生成现场通道二维码（需 X-Admin-Token） |
| POST | /api/admin/users/{id}/reset-device | 解绑用户设备（需 X-Admin-Token） |
| GET、POST | /api/admin/settings | 后台开关读取与修改（需 X-Admin-Token） |
| POST | /api/admin/seats/import | 批量导入桌位（需 X-Admin-Key） |
| GET | /api/admin/seats | 桌位分页列表与桌数统计（需 X-Admin-Key） |

## 桌位图

嘉宾在「参会服务 → 桌位图」查看桌号，本人与每位同行人各一张卡片，下方是全场位置图。
全场位置图为预留图片位：小程序在 `pages/seat/index.js` 的 `HALL_IMAGES` 按场次填写图片路径，
网页版在 `planb-web/config.js` 的 `hallImages` 填写；未配置时显示占位框。
接口只下发本人及同行人的桌号，不返回其他嘉宾信息。

会务在「审核后台 → 桌位批量导入」导入桌号：

- 格式：每行 `姓名,手机号,桌号`，首行表头自动跳过，多余的列忽略，支持逗号/分号/制表符/空白分隔
- 网页版还支持直接选择 CSV / TXT 文件（UTF-8 解析失败时自动按 GBK 重试）
- 导入方式：`合并更新`（按手机号更新或新增）或 `覆盖该场次`（先清空再导入）
- 按「场次 + 手机号」与参会登记的同行人匹配，单次最多 2000 条，不合法的行会跳过并回传行号
- 数据表 `gonghcuang_seat`，新库见 `db/schema.sql`，老库执行 `db/migrate_v9_seat.sql`

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
