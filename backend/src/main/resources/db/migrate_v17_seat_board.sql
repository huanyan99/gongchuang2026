-- v17：桌位分配重构（看板式拖动分配）+ 场次桌位可见性 + 审计字段。
-- 上线新版后端前执行一次。
-- 说明：MySQL 5.7 不支持 ADD COLUMN IF NOT EXISTS。三条 CREATE 可重复执行；
--       两条 ALTER 只能执行一次（重复执行会报 Duplicate column，可忽略）。
-- 回滚：DROP TABLE gonghcuang_table / gonghcuang_seat_revision；
--       ALTER TABLE ... DROP COLUMN reviewed_by, DROP COLUMN reviewed_by_name；
--       ALTER TABLE gonghcuang_setting DROP COLUMN updated_by。
--       嘉宾端读取的 gonghcuang_seat 结构未做任何变更，旧代码可直接跑在新结构上。

CREATE TABLE IF NOT EXISTS gonghcuang_table (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_city VARCHAR(32) NOT NULL,
    table_no VARCHAR(32) NOT NULL,
    capacity INT NULL,
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

-- 用现有桌位初始化桌位定义；主桌（非数字开头，转换后为 0）排在数字桌之前。
-- MySQL 在 STRICT_TRANS_TABLES 下不允许 '10号桌' → 10 这类截断转换（错误 1292），
-- 因此这一段临时放宽 sql_mode，执行完立即恢复（本段四条语句必须在同一个连接里执行）。
SET @prev_sql_mode = @@SESSION.sql_mode;
SET SESSION sql_mode = '';
INSERT INTO gonghcuang_table (event_city, table_no, sort_no, created_at, updated_at)
SELECT t.event_city, t.table_no, CAST(t.table_no AS UNSIGNED), NOW(), NOW()
FROM (SELECT DISTINCT event_city, table_no FROM gonghcuang_seat) t
ON DUPLICATE KEY UPDATE gonghcuang_table.sort_no = VALUES(sort_no);
SET SESSION sql_mode = @prev_sql_mode;

-- 初始化场次版本号
INSERT INTO gonghcuang_seat_revision (event_city, revision, updated_at)
SELECT DISTINCT event_city, 1, NOW() FROM gonghcuang_seat
ON DUPLICATE KEY UPDATE gonghcuang_seat_revision.revision = gonghcuang_seat_revision.revision;

-- 场次桌位可见性：上海默认关闭，佛山/济南默认开启（与上线前的线上表现逐场一致）
INSERT INTO gonghcuang_setting (setting_key, setting_value, updated_at) VALUES
    ('seat_visible_foshan',   'true',  NOW()),
    ('seat_visible_jinan',    'true',  NOW()),
    ('seat_visible_shanghai', 'false', NOW())
ON DUPLICATE KEY UPDATE gonghcuang_setting.setting_value = gonghcuang_setting.setting_value;

-- 审计字段：谁审核的 / 谁改的开关（历史数据不回填）
ALTER TABLE gonghcuang_application
    ADD COLUMN reviewed_by BIGINT NULL,
    ADD COLUMN reviewed_by_name VARCHAR(64) NULL;

ALTER TABLE gonghcuang_setting
    ADD COLUMN updated_by VARCHAR(64) NULL;
