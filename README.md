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
| GET | /api/seat/me | 我的桌位与本场桌位图（需登录且登记已审核通过） |
| POST | /api/admin/seats/import | 批量导入桌位（需 X-Admin-Key） |
| GET | /api/admin/seats | 桌位分页列表与桌数统计（需 X-Admin-Key） |

## 桌位图

嘉宾在「参会服务 → 桌位图」查看自己的桌号（含同行人桌号），下方是全场位置图。
全场位置图为预留图片位：小程序在 `pages/seat/index.js` 的 `HALL_IMAGES` 按场次填写图片路径，
网页版在 `planb-web/config.js` 的 `hallImages` 填写；未配置时显示占位框。
接口只下发本人及同行人的桌号，不返回其他嘉宾信息。

会务在「审核后台 → 桌位批量导入」导入桌号：

- 格式：每行 `姓名,手机号,桌号[,座位号]`，首行表头自动跳过，支持逗号/分号/制表符/空白分隔
- 网页版还支持直接选择 CSV / TXT 文件（UTF-8 解析失败时自动按 GBK 重试）
- 导入方式：`合并更新`（按手机号更新或新增）或 `覆盖该场次`（先清空再导入）
- 按「场次 + 手机号」与参会登记的同行人匹配，单次最多 2000 条，不合法的行会跳过并回传行号
- 数据表 `gonghcuang_seat`，新库见 `db/schema.sql`，老库执行 `db/migrate_v9_seat.sql`
