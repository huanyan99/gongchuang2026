# 桌位分配重构 + 全量并发防护 · 开发方案（最终版 v2 · 已定稿）

> 10 条决策已全部拍板，本文为可直接落地的版本。
> 关联需求：① 桌位由「CSV 导入」改为「后台拖动分配」；② **所有功能**的多管理员并发防护。

---

## 0. 决策回执（你已拍板，本文按此执行）

| # | 议题 | 定稿 | 相对上一版的改动 |
| --- | --- | --- | --- |
| 1 | 旧导入接口 | **当场删除** | 删 `POST /api/admin/seats/import` 与两端导入 UI，不留兼容层 |
| 2 | 小程序后台 | **只放统计 + 「请用电脑端分配」提示**，分配功能不做 | 免去点击式分配的开发与联调 |
| 3 | 桌位容量 | **留空不限**，只保留字段结构 | 保存流程里不做容量校验，无 409/force 分支 |
| 4 | 审计字段 | **本期一起上** | v17 增加 `reviewed_by` 等列，新审核写入，历史不回填 |
| 5 | 上海场 | **改成后台开关**，管理员控制场次桌位是否对嘉宾显示 | 新增 3 个场次可见性开关 + 公开可见性接口；**嘉宾端要改**（见第 4 节） |
| 6 | 孤儿数据 | **保存时清理** | 济南 47 条无主桌位行随保存删除，确认弹窗显式列出条数 |
| 7 | 删除桌位 | **二次确认后自动退回未分配** | 由"报错要求先移出"改为"确认即执行"，服务端不再拦截 |
| 8 | 旧分页列表 | **删除** | 删 `GET /api/admin/seats`，统计改由看板接口提供 |
| 9 | 文档清理 | **本次一并清理** | 清 `hallImages` / `.hall-image` 死代码与过期描述 |
| 10 | 发布方式 | **一次发布** | 后端 + 网页 + 小程序后台 + v17 迁移同批上线 |

**关于第 5 条要特别说明**：上一版说"嘉宾端零改动"，加了开关之后这句不再成立。嘉宾端要删掉
`city === '上海'` 的硬编码，改为按后端返回的可见性渲染（文案保持「暂未更新~」不变，
视觉与交互完全一致，只是判断依据从"前端写死"变成"后台开关"）。这是你选择开关方案后
必须付的代价，影响面在第 7 节列出。

---

## 1. 事实基线（2026-09-29 实测生产库 gch_gjh）

| 场次 | 已通过登记 | 参会人 | 现有桌数 | 已分配 | 未分配 | 孤儿桌位行 |
| --- | --- | --- | --- | --- | --- | --- |
| 上海 | 2 | 2 | 0 | 0 | 2 | 0 |
| 佛山 | 165 | 172 | 16 | 124 | 48 | 0 |
| 济南 | 196 | 197 | 20 | 152 | 45 | **47** |

约束与事实（都直接影响实现）：

1. **MySQL 5.7.38**：无 `REGEXP_REPLACE`、无 `ADD COLUMN IF NOT EXISTS`；`CAST('10号桌' AS UNSIGNED)=10`、`CAST('主桌1' AS UNSIGNED)=0` 可用。隔离级别 REPEATABLE-READ，开启 `ONLY_FULL_GROUP_BY`。
2. `gonghcuang_application_guest.phone` 有全局唯一约束（`uk_application_guest_phone`，v14）→ 参会人可用手机号做业务主键。
3. `gonghcuang_seat` 有 `UNIQUE(event_city, phone)`。
4. 嘉宾端 `SeatService.mySeat()` 按「本场次 + 手机号 ∈ {主联系人, 同行人}」匹配。**手机号对不上登记的桌位行，任何嘉宾都看不到**（济南那 47 条的由来）。
5. 桌号命名不统一：佛山 `10号桌`/`主桌1`，济南 `10桌`。
6. 每桌实际 3～11 人。
7. 后台会话**账号独占**（登录作废该账号其它会话）→ 多管理员必须各自建号。
8. 已有并发防护：审核 `reviewIfPending`、核验 `checkInIfApproved`、邀请码名额 `claim`（`WHERE used_count < max_uses`）、抽奖码/邀请码唯一索引重试、登记防重唯一表。

---

## 2. 目标与非目标

**目标**

- 后台桌位分配改为「左人员 / 右桌位」拖动弹窗，点保存落库；删除 CSV 导入。
- 后台可开关每个场次的桌位图对嘉宾是否显示。
- **所有**写接口在多管理员（以及嘉宾与管理员的交叉操作）下不互相破坏，冲突有人话提示。

**非目标**

- 不做实时协同（WebSocket）、不做多人同屏编辑、不做自动排桌。
- 不做小程序端的桌位分配交互。
- 不给嘉宾端增加新的展示信息（依旧只下发本人与同行人的桌号）。

---

## 3. 桌位看板

### 3.1 数据模型（migrate_v17，MySQL 5.7 语法）

~~~sql
-- v17：桌位分配重构 + 场次可见性 + 审计字段。上线新版后端前执行。
-- 三条 CREATE 可重复执行；ALTER 只能执行一次（重复执行报 Duplicate column，可忽略）。

CREATE TABLE IF NOT EXISTS gonghcuang_table (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_city VARCHAR(32) NOT NULL,
    table_no VARCHAR(32) NOT NULL,
    capacity INT NULL,                      -- 预留，本期恒为 NULL
    sort_no INT NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_table_city_no (event_city, table_no),
    KEY idx_table_city_sort (event_city, sort_no)
) ENGINE=InnoDB DEFAULT CHARSET utf8mb4;

CREATE TABLE IF NOT EXISTS gonghcuang_seat_revision (
    event_city VARCHAR(32) PRIMARY KEY,
    revision BIGINT NOT NULL DEFAULT 1,
    updated_by BIGINT NULL,
    updated_by_name VARCHAR(64) NULL,
    updated_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET utf8mb4;

-- 用现有桌位初始化桌位定义；主桌（非数字开头，CAST 后为 0）排在数字桌之前
INSERT INTO gonghcuang_table (event_city, table_no, sort_no, created_at, updated_at)
SELECT t.event_city, t.table_no, CAST(t.table_no AS UNSIGNED), NOW(), NOW()
FROM (SELECT DISTINCT event_city, table_no FROM gonghcuang_seat) t
ON DUPLICATE KEY UPDATE gonghcuang_table.sort_no = VALUES(sort_no);

-- 初始化场次版本号
INSERT INTO gonghcuang_seat_revision (event_city, revision, updated_at)
SELECT DISTINCT event_city, 1, NOW() FROM gonghcuang_seat
ON DUPLICATE KEY UPDATE gonghcuang_seat_revision.revision = gonghcuang_seat_revision.revision;

-- 场次桌位可见性开关：上海默认关闭，佛山/济南默认开启（与当前线上表现完全一致）
INSERT INTO gonghcuang_setting (setting_key, setting_value, updated_at) VALUES
    ('seat_visible_foshan',  'true',  NOW()),
    ('seat_visible_jinan',   'true',  NOW()),
    ('seat_visible_shanghai','false', NOW())
ON DUPLICATE KEY UPDATE gonghcuang_setting.setting_value = gonghcuang_setting.setting_value;

-- 审计字段：谁审的 / 谁改的开关
ALTER TABLE gonghcuang_application
    ADD COLUMN reviewed_by BIGINT NULL,
    ADD COLUMN reviewed_by_name VARCHAR(64) NULL;

ALTER TABLE gonghcuang_setting
    ADD COLUMN updated_by VARCHAR(64) NULL;
~~~

同步更新 `backend/src/main/resources/db/schema.sql`（新库一次建全，含新表与新列）。

**回滚**：三条 `CREATE` 可 DROP，两条 ALTER 可 DROP COLUMN；`gonghcuang_seat` 结构不变 → 旧后端可直接跑在新结构上。

### 3.2 接口

**看板读取** `GET /api/admin/seats/board?city=济南[&summaryOnly=1]`

~~~json
{
  "eventCity": "济南", "revision": 3,
  "updatedAt": "2026-09-29T18:31:32", "updatedByName": "超级管理员",
  "guestVisible": true,
  "tables": [{ "id": 12, "tableNo": "1桌", "sortNo": 1 }],
  "people": [{
    "phone": "13800000001", "name": "张三", "company": "某某科技", "position": "CTO",
    "applicationId": 10, "contactPhone": "13800000001", "role": "主联系人", "tableNo": "1桌"
  }],
  "summary": { "tableCount": 20, "peopleCount": 197, "assigned": 152, "unassigned": 45 },
  "orphanCount": 47
}
~~~

- `summaryOnly=1` 只返回 `eventCity / revision / summary / orphanCount / guestVisible`（小程序后台的统计与网页的场次摘要都用它，避免拉 200 人）。
- `people` = 本场次**审核通过**登记的全体参会人（含主联系人与同行人），`tableNo=null` 表示未分配。
- `orphanCount` = 该场次 seat 行中手机号对不上登记的条数（确认弹窗要提示将清理多少条）。
- `guestVisible` 复用第 4 节的场次开关。

**看板保存** `POST /api/admin/seats/board`

~~~json
{
  "eventCity": "济南",
  "revision": 3,
  "tables": [
    { "id": 12, "tableNo": "1桌", "sortNo": 1 },
    { "tableNo": "23桌", "sortNo": 23 }
  ],
  "assignments": [{ "phone": "13800000001", "tableNo": "1桌" }]
}
~~~

服务端处理（`SeatBoardService.save`，单事务）：

1. 入参校验：`eventCity` 非空；`tables.tableNo` 去重且 ≤32 字符；`assignments.phone` 去重；`assignments.tableNo` 必须出现在入参 `tables` 中。
2. 取场次锁 `SELECT GET_LOCK(CONCAT('gch_seat:', city), 3)`；失败 → 1003「该场次正被其他管理员保存，请稍后重试」；`finally` 中 `RELEASE_LOCK`（与取锁同一连接）。
3. 校验版本：库中 revision ≠ 入参 → 1003「该场次桌位已被其他管理员修改，请重新打开」。
4. 校验人员：`assignments` 中每个 phone 必须是本场次已通过登记的参会人，否则 1003 + 明细（前端重新加载）。
5. 应用（顺序固定）：
   a. upsert 桌位定义（有 id 更新、无 id 插入）；
   b. **删除**该场次不在入参里的桌位定义（其中的人随后变为未分配，见第 3.4 节）；
   c. **全量替换** seat 行：删除该场次不在 `assignments` 中的人（含孤儿行），upsert 在 `assignments` 中的人；
      姓名等字段**一律以登记数据为准**，不采信前端；
   d. `revision + 1`，写 `updated_by / updated_by_name / updated_at`。
6. 返回最新 `revision` 与 `summary`。

> **全量替换的边界**：只处理"本场次 + 已通过登记"这两个集合的交集与差集。弹窗打开后才被审核通过的人不在入参里，也就不会被写成任何桌位，天然保持未分配——不会被误删（他本来就没有 seat 行）。

### 3.3 保存前的确认弹窗

保存请求发出**之前**，前端已经持有全量状态，可直接算出变更摘要，不需要多一次往返：

- 新增 X 桌、改名 Y 桌、删除 Z 桌（其中 N 人将退回未分配）
- 移动 M 人、移出 K 人
- 将清理 W 条无对应登记的桌位记录（来自 `orphanCount`，仅当本次保存真的会覆盖到它们时显示）

### 3.4 删除桌位的语义

按你的定稿：**提示二次确认，确认后自动退回未分配**。

- 前端：删除桌位时，先把该桌上的人从 `assignments` 中移除（变成未分配），再从 `tables` 中移除；确认弹窗写明「X桌还有 N 人，将退回未分配」。
- 服务端：不做拦截，按 5.b / 5.c 顺序执行即天然得到该结果。
- 撤销：本地 undo 栈可回退，保存前随时可恢复。

### 3.5 容量

- 字段保留（`capacity`），本期**不暴露 UI、不写值、不校验**。
- 将来启用时只需：看板接口返回该字段 + 保存前做一次本地/服务端校验，无需再改表。

---

## 4. 场次桌位可见性开关（决策 5）

### 4.1 设计

- 复用 `gonghcuang_setting`，键名沿用抽奖开关的命名习惯：`seat_visible_foshan / seat_visible_jinan / seat_visible_shanghai`。
- 默认值：**佛山 / 济南 = true，上海 = false**（与当前线上表现逐场一致，上线即无缝）。
- `SettingService` 增加 `SEAT_VISIBLE_KEYS` 与 `isSeatVisible(city)`，默认值按场次给（不看开关时也能保持现状）。
- 后台「安全设置」区块增加三个开关（复用现有开关控件与 `POST /api/admin/settings/{key}`，无需新接口）。

### 4.2 嘉宾端如何判断（关键）

新增**公开**接口（不泄露任何嘉宾数据，只回布尔）：

~~~text
GET /api/seat/visibility?city=上海  →  { "city": "上海", "visible": false }
~~~

- 为什么必须是公开接口：上海场当前只有 2 人审核通过，其余嘉宾没有登记。如果改成调
  `/api/seat/me` 再判断，未通过审核的嘉宾会走到错误分支弹「暂不可查看」，这是**行为倒退**。
  先查可见性、不可见就直接渲染「暂未更新~」，才能与今天完全一致。
- `/api/seat/me` 内部同样做一次可见性校验（防御性，且现场通道会话走的是同一接口）：
  不可见时返回 `{ eventCity, visible: false, published: false, mySeats: [] }`，**不下发任何桌位数据**。

### 4.3 两端嘉宾页改动

- 删除 `if (eventCity === '上海') return` 的硬编码（网页 `seat.js:27` / 小程序 `index.js:13`）。
- 进入页面先请求 `/api/seat/visibility?city=`：
  - `visible === false` → 渲染「暂未更新~」（文案、样式、位置全部不变）
  - `visible === true` → 走原有 `loadSeat()` 流程
- 保留 `eventCity` 为空时的兜底（直接走 `loadSeat`，由 `/api/seat/me` 返回真实场次）。

### 4.4 现场通道

通道会话只放行 `/api/seat/**`，可见性接口挂在同前缀下 → 通道嘉宾也能正确拿到可见性，无需改动拦截器白名单。

---

## 5. 全量并发防护矩阵（决策：覆盖所有功能）

下面把系统里**每一个写接口**都列出来，标注现状、风险与最终方案。带 🔴 的是本次新发现、必须修的。

### 5.1 管理端（`/api/admin/**`，`X-Admin-Token`）

| 接口 | 并发场景 | 现状 | 最终方案 |
| --- | --- | --- | --- |
| `POST /login` | 同一账号并发登录 | 会话互斥已有；失败计数是读-改-写 | 失败计数改原子 `UPDATE … SET failed_count = failed_count + 1`，锁定判定依据库中值重读（低危，顺手修） |
| `POST /logout` | 并发登出 | 按 `token_hash` 删除 | 天然安全，不动 |
| `POST /password` | 同一账号并发改密 | 校验旧口令后整行写新盐 | 改为条件更新（`WHERE id=? AND password_hash=?`），失败返回「口令已被其他会话修改，请重新登录」 |
| `POST /passes` | 并发建通道 | 各自 insert 独立行 | 天然安全，不动 |
| `POST /passes/{id}/disable` | 重复停用 | 无条件 update | 条件更新 `WHERE id=? AND enabled=1`，返回 `changed` 标志；已停用返回「通道已停用」 |
| `POST /users/{id}/invitation-permissions` | 两人同时授权同一用户 | 🔴 `selectById → 改字段 → updateById` 整行回写，会覆盖对方刚改的字段 | 改 `LambdaUpdateWrapper` 只 set `can_invite / can_review` 两列 |
| `POST /invitation` | 并发生成邀请码 | 唯一索引 + 重试（`MAX_CREATE_RETRY`） | 已有，不动 |
| `POST /applications/{id}/review` | 两人同时审同一单 | 已有条件更新 `WHERE status='PENDING'`，后到者 3003 | 保持；补写 `reviewed_by / reviewed_by_name` 留痕 |
| `POST /checkin` | 两人同时核验同一人 | 已有 `WHERE status='APPROVED' AND checked_in_at IS NULL` | 保持 |
| `POST /seats/board` | 两人同时排同一场次 | 🔴 全新接口 | revision 乐观锁 + `GET_LOCK` 场次锁 + 单事务全量替换（第 3.2 节） |
| `POST /users/{id}/reset-device` | 重复解绑 | 条件式 update，已解绑无提示 | 补 `WHERE device_id IS NOT NULL`，返回是否真的解绑；已解绑提示「该用户当前未绑定设备」 |
| `POST /settings/{key}` | 两人同时改开关 | 🔴 先 `selectById` 判存在再 insert/update | 改 `INSERT … ON DUPLICATE KEY UPDATE` 原子 upsert，并写 `updated_by` |
| ~~~POST /seats/import~~~ | — | — | **删除** |
| ~~~GET /seats~~~（分页列表） | — | — | **删除**，统计由看板接口提供 |

### 5.2 审核员端（`/api/invitations/**`，嘉宾身份 + `canReview`）

| 接口 | 并发场景 | 现状 | 最终方案 |
| --- | --- | --- | --- |
| `POST /invitations` | 并发生成定向邀请码 | 唯一索引 + 重试 | 已有，不动 |
| `POST /invitations/applications/{id}/review` | 与管理员后台同时审同一单 | 与管理端**共用** `ApplicationService.review`，已有 CAS | 保持；同样补 `reviewed_by` |

### 5.3 嘉宾端（会影响"操作唯一性"的写操作）

| 接口 | 并发场景 | 现状 | 最终方案 |
| --- | --- | --- | --- |
| `POST /api/apply` | 同一人并发提交 | 唯一表 `gonghcuang_registration_identity` 兜底（v16）；邀请码名额用原子 `claim` | 已有，不动 |
| `PUT /api/apply` | 🔴 **嘉宾改登记 vs 管理员审核** | `resubmit` 只按 `edit_count<2` 条件更新，**状态被无条件重置为 PENDING**。管理员刚通过，嘉宾此时提交修改 → 审核结果被静默撤回，而嘉宾的抽奖码、桌位、入场凭证随即失效 | 条件更新带上读到的状态与 edit_count；状态已变 → 返回 1003「该登记刚被审核，请刷新后确认再修改」。前端收到后刷新登记页并提示 |
| `POST /api/lottery/draw` | 并发领号 / 重复领号 | 唯一索引 `uk_lottery_lucky_code` + 碰撞重试；同用户重复请求返回已有号码 | 已有，不动 |
| `POST /api/attendance/scan` | 重复提交 | 按设计每次都新增一条；前端已做页面内防重 | 保持设计 |
| `POST /api/pass/session` | 并发换会话 | 各自 insert 独立行 | 天然安全 |
| `POST /api/auth/login /web-login /phone-login /code-login /ticket-login` | 🔴 **两台设备同时首登同一账号** | `applyDeviceGuard` 是"读 device_id → 比较 → 写回"，两台设备同时首登会**双双绑定成功**，"一个账号一台设备"失效 | 改条件更新 `UPDATE gonghcuang_user SET device_id=? WHERE id=? AND (device_id IS NULL OR device_id='')`；受影响行数为 0 → 重读并按冲突规则抛 1004。开启限制的场景下由数据库保证唯一 |
| `POST /api/auth/logout /phone /profile /profile/verify /phone-hint` | 并发改档案 | 单行更新，无跨管理员语义 | 保持（同一用户自己的数据） |

### 5.4 前端配套（两端后台 + 嘉宾端）

1. **行级 pending**：用 `pendingIds` 替代页面级 `reviewing`；被点的行两个按钮同时置灰并显示「处理中」，其他行仍可操作。
2. **冲突自愈**：识别 `code === 1003 / 3003` → 提示「已被其他管理员处理，列表已刷新」+ 自动重新拉列表。
3. **陈旧可见**：审核列表显示 `reviewed_at` 与审核人；PC 端加手动刷新；`onShow` 静默刷新待审核列表。
4. **看板冲突出口**：保存返回 1003 → 弹「他人已修改」，提供「重新加载」与「放弃我的改动」，绝不静默覆盖。
5. **重复提交兜底**：所有写按钮在飞行期间禁用（含小程序端）。
6. **多账号约定**：登录页与 README 注明每个管理员用独立账号（同账号登录会互踢）。

---

## 6. 删除清单

**接口（后端）**

- `POST /api/admin/seats/import` 及其 DTO（`SeatImportRequest` / `SeatRowRequest`）
- `GET /api/admin/seats` 分页列表
- `SeatService.importSeats()` / `SeatService.page()`（连同 `MAX_IMPORT_ROWS`、行解析与错误收集逻辑）

**前端 UI**

- 网页后台：桌位文本框、文件选择（含 UTF-8/GBK 解码）、导入模式选择、解析预览、导入按钮
- 小程序后台：`parseSeatRows`、`seatText/seatRows/seatModeIndex` 等状态与对应 WXML
- 小程序后台桌位区块改为：场次选择 + 「N 桌 / M 人 · 已分配 X / 未分配 Y」+ **「桌位分配请在电脑端后台操作」**提示（数据来自 `board?summaryOnly=1`）

**死代码 / 过期文档（决策 9）**

- `planb-web/config.js` 的 `hallImages` 配置项（已无引用）
- 小程序 `pages/seat/index.wxss` 的 `.hall-image` / `.hall-placeholder`（已无引用）
- `README.md`、`planb-web/README.md`、`AGENTS.md` 中"全场位置图 / HALL_IMAGES / hallImages"的描述

---

## 7. 影响范围

**后端新增**：`entity/TableSeat.java`、`entity/SeatRevision.java`、`mapper/TableSeatMapper.java`、`mapper/SeatRevisionMapper.java`、`service/SeatBoardService.java`、`dto/SeatBoardSaveRequest.java`

**后端改动**：`AdminController`（board 两个接口、删 import/seats、权限列级更新、解绑条件更新、停用条件更新）、`SeatService`（删旧方法、`mySeat` 加可见性）、`SettingService`（upsert + 可见性键 + 默认值）、`ApplicationMapper/ApplicationService`（review 写审核人、resubmit 带状态条件）、`AuthService`（设备条件绑定）、`AdminAccountService`（失败计数原子化、改密条件更新）、`GlobalExceptionHandler`（重复键按表分流）、`db/schema.sql` + 新增 `db/migrate_v17_seat_board.sql`

**网页**：`src/pages/admin.js`（删导入 UI、新增看板弹窗、审核行级 pending）、`styles/seat-board.css`（新增）或并入 `admin-pc.css`、`src/pages/seat.js`（去掉上海硬编码，改为按可见性渲染）、`config.js`（删 hallImages）

**小程序**：`pages/admin/*`（删导入 UI、统计 + 提示）、`pages/seat/*`（去掉上海硬编码）、`pages/seat/index.wxss`（删死样式）

**文档**：`README.md`、`planb-web/README.md`、`AGENTS.md`、`backend/GROUP_REGISTRATION.md`（如涉及）

**明确不受影响**：抽奖、扫码签到、入场核验、登记提交、现场通道换会话、审核列表的其他字段、导出（`/api/admin/export` 等）

**改动的额外收益**：济南那 47 条无主桌位记录随首次保存被清理，之后"济南 N 桌 / M 人"的统计口径才与实际可见人数一致。


---

## 8. 风险与对策

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| 全量替换误伤"并发新增的已通过登记" | 少数人丢桌位 | 只处理入参与库的差集；新人不在入参里就没有 seat 行，天然保持未分配 |
| 济南 47 条无主记录被清理 | 会务以为数据丢了 | 确认弹窗显式列出条数；上线前可先导出备份；`orphanCount` 可随时核对 |
| 可见性开关误判导致某场次嘉宾看不到桌位 | 现场投诉 | 默认值与当前线上**逐场一致**；开关在后台实时读库，改完立即生效；上海默认关，佛山/济南默认开 |
| 新增公开接口 `/api/seat/visibility` | 暴露"哪些场次开着" | 只返回布尔、不含任何嘉宾数据；不可见场次连桌位数据都不下发 |
| 拖拽在触屏/小屏不可用 | 影响手机端会务 | Pointer Events 一套实现 + 点击分配兜底 + 小屏 Tab 布局 |
| 弹窗内 200 人渲染卡顿 | 体验差 | 公司分组折叠（默认只展开前几组）+ 搜索过滤；必要时再加懒渲染 |
| `GET_LOCK` 与连接池交互导致锁未释放 | 场次被锁死 | 取锁/释放放同一连接；`finally` 强制释放；超时 3 秒；释放失败仅记日志不阻断 |
| 保存后嘉宾端立即可见（无"发布"动作） | 误操作直接对外 | 与旧导入行为一致；由保存前确认弹窗承担最后一道确认 |
| 改登记 vs 审核的竞态改动影响正常编辑 | 嘉宾正常改登记被拦 | 仅当"读到的状态与库中不一致"才拒绝；正常流程（未审核/已驳回）不受影响 |
| v17 的 ALTER 重复执行报错 | 误以为迁移失败 | 迁移文件头注明：CREATE 可重复、ALTER 只执行一次 |
| 一次发布（决策 10）回归面大 | 现场故障 | 迁移与后端先行验证（看板读取可独立核对）；发布顺序见第 10 节；seat 表结构未变，回滚只需换回旧 jar + 旧前端 |

---

## 9. 测试与验收

**新增单元测试**

- 看板读取：人员分组字段完整、未分配人数正确；上海场 `guestVisible=false`
- 保存校验：重复 phone、未登记 phone、引用不存在的桌号 → 1003；`tables` 内重复桌号 → 1000
- 全量替换：新增/移动/移出/删桌退回未分配/清理孤儿行的计数全部正确
- 版本号：revision 不匹配 → 1003 且不写库；匹配 → revision +1，`updated_by` 落库
- 场次锁：模拟并发保存，第二个请求拿到 1003 而不是脏写
- 可见性：`isSeatVisible` 默认值（佛山/济南 true、上海 false）与开关覆盖
- `resubmit`：状态已变时拒绝且不写库
- 设备绑定：条件更新在并发下只允许一台设备绑定成功

**手工验证**

- 两个浏览器 + 两个管理员账号：同时打开看板 → 一方保存 → 另一方保存必须 1003 且不覆盖
- 并发审核：两账号同时点"通过" → 第二个 3003，列表自动刷新
- 嘉宾端回归：佛山、济南各取一个账号验证桌号与文案不变；上海账号验证仍是「暂未更新~」；把上海开关打开 → 上海账号变成「桌位安排尚未发布」
- 现场通道会话：`/api/seat/**` 内可用，访问抽奖/登记仍被拒
- 后台关掉佛山开关 → 佛山嘉宾立即变成「暂未更新~」；重新打开即恢复

**验收口径**

- 后台不再有 CSV/文本导入入口，小程序后台桌位区块只有统计与电脑端提示
- 拖拽与点击两种方式都能完成分配，保存后刷新页面结果一致
- 任意并发冲突都有可理解的中文提示，且不会静默覆盖他人数据
- 可见性开关改完立即生效，嘉宾端文案与今天完全一致

---

## 10. 落地顺序（一次发布，决策 10）

1. v17 迁移（含可见性开关初始值）+ 实体/Mapper + 看板读取接口 → 对济南真实数据核对，可独立验收
2. `SeatBoardService.save`（锁、版本、全量替换、校验）+ 单元测试
3. 可见性：`SettingService` 键与默认值 + `/api/seat/visibility` + `mySeat` 防御校验 + 后台三个开关
4. 并发防护其余落点：设备绑定条件更新、`resubmit` 状态条件、开关 upsert、权限列级更新、解绑/停用条件更新、改密条件更新、登录失败计数原子化、异常分流
5. 删除旧接口与旧 UI（含两端导入界面）
6. 网页后台看板弹窗（PC 拖拽 → 小屏 Tab → 点击兜底）+ 审核行级 pending 与冲突自愈
7. 小程序后台统计 + 提示；两端嘉宾页去硬编码接可见性
8. 文档更新 + 死代码清理 + 全量回归

---

## 11. 三个提醒（不是决策，但上线前值得再看一眼）

1. **上海场放开时机会自己到来**：开关做好后，只要上海开始审核通过、桌位排好，把开关打开即可，不需要改代码。但记得上海场目前只有 2 人通过、0 张桌——过早打开会显示「桌位安排尚未发布」。
2. **济南 47 条无主记录清理前建议先备份**：一条 `SELECT * FROM gonghcuang_seat WHERE event_city='济南'` 导出即可，万一会务对照的是旧名单还能查。
3. **"一次发布"意味着旧前端会短暂不兼容**：`GET /api/admin/seats` 与 `POST /api/admin/seats/import` 被删除后，**尚未刷新页面**的旧网页后台会报错。建议发布时提示会务人员刷新一次后台页面（旧页面本身不会自动更新）。


---

## 13. 落地结果（已实施）

本方案已按第 10 节顺序全部实施并逐阶段核对，改动 35 个文件（+485 / -708 行）。

### 数据库
- `db/migrate_v17_seat_board.sql` 已在库 `gch_gjh`（10.1.251.114）执行：
  新建 `gonghcuang_table`（由现有桌位种子出 佛山 16 + 济南 20 = 36 条，主桌排最前）、
  `gonghcuang_seat_revision`（佛山/济南 revision=1）、写入三个可见性开关，
  并给 `gonghcuang_application` 加 `reviewed_by/reviewed_by_name`、给 `gonghcuang_setting` 加 `updated_by`。
- 种子数据遇到 MySQL 5.7 严格模式下 `CAST('10号桌' AS UNSIGNED)` 报 1292 的问题，
  用临时放宽 `sql_mode` 解决（脚本内注释已说明）。

### 后端
- 新增：`SeatBoardService`（看板读取 + 保存：场次锁、版本号、单事务全量替换、人员归属校验、孤儿清理）、
  `SeatTable/SeatRevision` 实体、`SeatBoardMapper/SeatTableMapper/SeatRevisionMapper`、`SeatBoardPerson/SeatBoardSaveRequest`。
- 新增接口：`GET/POST /api/admin/seats/board`、公开的 `GET /api/seat/visibility`。
- 删除接口：`POST /api/admin/seats/import`、`GET /api/admin/seats` 及两个 DTO、`SeatService` 的导入/分页/统计代码。
- `SeatService.mySeat` 增加可见性校验：未开放场次不下发任何桌位数据。
- 并发防护：设备首次绑定改条件更新（`bindDeviceIfEmpty`）、改登记带状态与编辑次数条件（`resubmit`）、
  开关改原子 upsert、邀请权限改列级更新、通道停用条件更新、改密条件更新、登录失败计数数据库自增、
  重复键异常按表分流。
- 审核写入审核人（`reviewed_by/reviewed_by_name`），后台与邀请人两个入口都传。

### 前端
- 网页：新增 `src/pages/seat-board.js` + `styles/seat-board.css` 分配看板（拖拽 + 点击兜底 + 撤销/重做 + 冲突重新加载），
  后台去掉 CSV 导入入口、改为「打开桌位分配表」；审核改行级 pending、冲突自动刷新、显示审核人与时间。
- 小程序：后台去掉导入入口，改为统计 + 「分配说明」；嘉宾页去掉上海硬编码。
- 两端嘉宾页都改为先查 `/api/seat/visibility`，未开放仍显示原文案「暂未更新~」。
- 清理死代码：`planb-web/config.js` 的 `hallImages`、`admin.css~/`admin-pc.css` 的 `.seat-preview*`/`.seat-input*`、
  小程序 `.seat-input/.seat-ph/.hall-image/.hall-placeholder`。

### 验证证据
- `mvn test`：47 个测试全绿（新增 `SeatBoardServiceTest` 7 个、`SeatServiceVisibilityTest` 2 个、`AuthServiceTest` 增 2 个并发用例）。
- 看板读取与独立 SQL 统计逐项一致：佛山 16 桌 / 172 人 / 已分配 124 / 未分配 48 / 孤儿 0；
  济南 20 桌 / 197 人 / 152 / 45 / 孤儿 47；上海 0 桌 / 2 人 / 0 / 2 / 孤儿 0。
- 保存端到端（在上海场做的可回滚验证，已还原）：建桌 + 分配成功、revision 0→1、审核人留痕正确；
  陈旧版本号重放 → 1003；未登记手机号 → 1003；桌位不存在 → 1000。
- 可见性：上海 false / 佛山 true（经网页同源代理也一致）；开关切换立即生效；未知开关被拒。
- 旧接口 `/api/admin/seats` 与 `/api/admin/seats/import` 现在返回 404。

### 仍需人工确认的部分
- 分配看板的拖拽与布局没有自动化测试覆盖（无浏览器桥），需要人工在
  `http://127.0.0.1:4555/#/admin` 里点一遍：拖动、点击分配、删桌退回、撤销、保存、以及两个账号同时打开时的冲突提示。
- 小程序端需在微信开发者工具里验证桌位页可见性与后台提示文案。
