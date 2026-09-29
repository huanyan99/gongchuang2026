# v17 桌位看板 · 部署切换说明

> 本次上线的三件事：① 桌位从「CSV 批量导入」改为「后台拖拽看板」；② 补齐多管理员并发防护；
> ③ 数据库新增两张表 + 两组列。嘉宾端接口与页面结构不变（只有场次可见性改由后台开关控制）。
>
> 版本标记：网页静态资源全部带 `?v=20260930-4`，桌位看板右上角会显示 `2026-09-30.4`，可用来确认浏览器加载的是哪一版。

---

## 1. 改动清单

| 位置 | 内容 |
| --- | --- |
| 后端 | 新增 `SeatBoardService`（场次锁 + 版本号 + 单事务全量替换）、`gonghcuang_table` / `gonghcuang_seat_revision` 的实体与 Mapper、看板两个接口 |
| 后端 | 删除 `POST /api/admin/seats/import`、`GET /api/admin/seats` 及其 DTO 与 `SeatService` 的导入代码 |
| 后端 | 新增公开接口 `GET /api/seat/visibility`；`SeatService.mySeat` 增加场次可见性校验 |
| 后端 | 并发防护：设备首次绑定、改登记、开关写入、邀请权限、解绑设备、停用通道、改密、登录失败计数、重复键文案 |
| 后端 | 审核写入 `reviewed_by / reviewed_by_name` |
| 网页版 | 新增桌位分配看板（`src/pages/seat-board.js` + `styles/seat-board.css`）；后台去掉 CSV 导入；审核改行级处理中 + 冲突自动刷新 |
| 网页版 | 桌位页去掉「上海」硬编码，改为按 `/api/seat/visibility` 渲染；删除 `hallImages` 等死代码 |
| 小程序 | 后台桌位区块改为统计 + 说明；桌位页同样按可见性渲染与「现场通道」保持兼容 |
| 数据库 | `db/migrate_v17_seat_board.sql`（新库见 `db/schema.sql`，已同步） |
| 文档 | `README.md`、`planb-web/README.md`、`AGENTS.md`、`docs/` |

---

## 2. 上线前准备

1. **备份数据库**。至少要留一份 `gonghcuang_seat` 的副本：
   ```sql
   SELECT * FROM gonghcuang_seat WHERE event_city = '济南';
   ```
   原因见第 8 节：济南有 47 条手机号对不上登记的桌位行，**第一次保存桌位时会被清理**。
2. **确认配置来源**。仓库里的 `application.yml` 不含任何口令，实际连接参数放在
   `backend/config/application-local.yml`（已 gitignore）或环境变量里，见 5.1。
3. 通知会务：**上线后刷新一次后台页面**（旧页面里缓存的是旧前端，且旧导入接口已删除）。

---

## 3. 数据库迁移（先做）

在目标库执行 `backend/src/main/resources/db/migrate_v17_seat_board.sql`。

- 文件里有 3 条 `CREATE TABLE IF NOT EXISTS` / `INSERT ... ON DUPLICATE KEY UPDATE`，**可重复执行**；
- 2 条 `ALTER TABLE ... ADD COLUMN`（`reviewed_by`、`updated_by`）**只能执行一次**，
  重复执行会报 `Duplicate column`，忽略即可；
- 如果这个库还没跑过 v9 的桌位表，先执行 `migrate_v9_seat.sql`。

执行后自检：

```sql
-- 1) 桌位定义应当等于现有场次的 distinct 桌号数量
SELECT event_city, COUNT(*) FROM gonghcuang_table GROUP BY event_city;
-- 2) 每个已有场次各有一行版本号，初始为 1
SELECT event_city, revision FROM gonghcuang_seat_revision;
-- 3) 三个场次可见性开关，佛山/济南 true、上海 false
SELECT setting_key, setting_value FROM gonghcuang_setting WHERE setting_key LIKE 'seat_visible%';
-- 4) 审核留痕列已加上
SHOW COLUMNS FROM gonghcuang_application LIKE 'reviewed_by%';
```

> 注意（MySQL 5.7）：迁移脚本里有一段临时放宽 `sql_mode`——因为 `STRICT_TRANS_TABLES`
> 下把 `'10号桌'` 转成数字会报 1292。**这四条语句必须在同一个连接里执行**（脚本已处理，别拆开跑）。

---

## 4. 部署顺序（有硬约束）

**后端 → 网页版 → 小程序**。

反过来会出问题：新版小程序的桌位页会先请求 `GET /api/seat/visibility`；如果后端还是旧的，这个接口是 404，
前端会回落到直接请求 `/api/seat/me`，于是**上海场从「暂未更新~」变成「桌位安排尚未发布」**——一个Guest可见的回归。

---

## 5. 操作步骤

### 5.1 后端

```bash
cd backend
mvn -DskipTests clean package        # 产出 target/wechat-app-backend-0.0.1-SNAPSHOT.jar
```

环境变量（生产至少要有前三个，否则微信相关接口不可用；缺 `wechat.appid` 等会导致启动失败）：

| 变量 | 必需 | 说明 |
| --- | --- | --- |
| `WECHAT_APPID` / `WECHAT_SECRET` | 是 | 小程序凭据；缺失时**启动会直接失败**（占位符无默认值） |
| `WECHAT_CALLBACK_TOKEN` | 用公众号回调时必需 | 须与公众号后台「服务器配置」里的 Token 一致 |
| `WECHAT_OA_APPID` / `WECHAT_OA_SECRET` | 用公众号网页授权时 | 网页版备用登录通道 |
| `WEB_BASE_URL` | 是 | 后台生成二维码用的网页地址 |
| `ADMIN_BOOTSTRAP_USERNAME` / `ADMIN_BOOTSTRAP_PASSWORD` | 首次建号时 | 库里已有管理员就不用配 |
| `WECOM_CORP_ID` / `WECOM_APP_SECRET` / `WECOM_SHEET_ENABLED` | 用企微同步时 | 不配则同步保持关闭 |
| `SPRING_DATASOURCE_URL/USERNAME/PASSWORD` | 是 | 或写进 `config/application-local.yml` |

启动后自检：

```bash
curl http://127.0.0.1:4556/api/hello
# 期望 {"code":0,"message":"success","data":{"message":"Hello from backend"}}
```

### 5.2 网页版

把 `planb-web/` 整个目录发布到站点根目录（纯静态，无需构建），Nginx 按 `planb-web/nginx.conf.example`
同源反代 `/api/` 到后端即可。

**缓存注意**：`nginx.conf.example` 里 `.css/.js` 是 `expires 7d`。本次所有静态资源都换成了新的
`?v=20260930-4`，浏览器会当成新文件重新拉取；但**已经打开的旧页面不会自己更新**，需要刷新一次。

### 5.3 小程序

上传新版本后重点看两处：

1. 桌位页：上海场显示「暂未更新~」，佛山/济南正常出桌号卡片；
2. 后台页：桌位区块显示统计 +「分配说明」按钮，不再有 CSV 导入框。

---

## 6. 上线验证清单

| # | 检查项 | 操作 | 预期 |
| --- | --- | --- | --- |
| 1 | 后端启动 | 看日志 | `Started Application`，无 `Could not resolve placeholder` |
| 2 | 看板读取 | 后台 → 桌位分配 → 打开 | 人数/已分配/未分配与登记数一致；上海为 0 桌 |
| 3 | 拖拽分配 | 拖一个人到某桌 | chip 落到桌上、左侧徽标同步、保存键出现 `*` |
| 4 | 保存 | 点保存 → 确认 | 修订号 +1，底部显示「上次修改：<管理员> <时间>」 |
| 5 | 并发 | 两个浏览器（两个账号）同开看板，A 先保存，B 再保存 | B 弹「该场次已被其他管理员修改」，B 的改动不落库 |
| 6 | 同名提示 | 佛山搜「廖龙斌」 | 两行都带琥珀色「同名」标签；点右侧 chip 能看到完整手机号与角色 |
| 7 | 场次开关 | 后台安全设置关掉佛山 → 嘉宾端桌位页 | 立即变成「暂未更新~」，且不再请求 `/api/seat/me` |
| 8 | 现场通道 | 扫码进通道会话 | 只能看桌位，访问抽奖/登记被拒 |
| 9 | 旧接口 | `curl -H "X-Admin-Token: <token>" http://<host>:4556/api/admin/seats` | 404（已按计划删除） |
| 10 | 版本标记 | 看板标题右侧 | 显示 `2026-09-30.4` |

---

## 7. 回滚

- **后端**：换回上一个 jar 即可。`gonghcuang_seat` 的表结构本次没有改动，
  新增的 `gonghcuang_table` / `gonghcuang_seat_revision` 与两列留着不影响旧代码。
- **网页版**：换回上一版静态文件。
- **数据**：唯一不可逆的是「第一次保存桌位时清理掉对不上登记的孤儿行」，所以第 2 节要求先备份。

---

## 8. 已知风险与注意事项

| 风险 | 说明 | 应对 |
| --- | --- | --- |
| 济南 47 条孤儿桌位行被清理 | 这些行的手机号对不上任何已通过登记的参会人，嘉宾端本来也看不到 | 先按第 2 节导出留档；看板底部会显示清理条数 |
| 旧页面报错 | 旧前端仍会调已删除的 `/api/admin/seats/import` → 404 | 上线后让会务刷新一次页面 |
| 上海场默认不显示 | 开关默认关闭，与上线前表现一致 | 等上海开始审核/排桌后，在后台安全设置里打开即可，不用改代码 |
| 手机后台模式 | 桌位看板在窄屏是上下两块布局，弹窗是看板自带的 | 已实测；如发现异常按第 6 节复测 |
| 并发只做了手工验证 | 没有压测 | 冲突路径已用双标签页实测；如需更强保证可再加压测 |

---

## 9. 本次提交涉及的文件（供 review 参考）

- 后端新增：`SeatBoardService`、`SeatTable` / `SeatRevision`、三个 Mapper、两个 DTO、`migrate_v17_seat_board.sql`、两个测试类
- 后端修改：`AdminController`、`SeatController`、`SeatService`、`SettingService`、`ApplicationService`、
  `AuthService`、`PassService`、`AdminAccountService`、若干个 Mapper、`GlobalExceptionHandler`、`WebMvcConfig`、`schema.sql` / `schema-h2.sql`
- 后端删除：`SeatImportRequest`、`SeatRowRequest`
- 网页版新增：`src/pages/seat-board.js`、`styles/seat-board.css`
- 网页版修改：`src/pages/admin.js`、`src/pages/seat.js`、`index.html`、`src/main.js`、`config.js`、`styles/admin.css`、`styles/admin-pc.css`
- 小程序修改：`pages/admin/*`、`pages/seat/*`
- 文档：`README.md`、`planb-web/README.md`、`AGENTS.md`、`docs/`

> `backend/config/application-local.yml` 已被 gitignore，里面放的是本机数据库口令，**不会也不应该进仓库**。
> 仓库里的 `application.yml` 保持原样（不含任何口令）。
