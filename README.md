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
