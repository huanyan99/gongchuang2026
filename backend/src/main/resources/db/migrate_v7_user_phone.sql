-- 已有 MySQL 数据库执行一次；新数据库已包含在 schema 中。
ALTER TABLE gonghcuang_user
    ADD COLUMN phone VARCHAR(32) NULL,
    ADD COLUMN phone_country_code VARCHAR(8) NULL,
    ADD COLUMN phone_verified_at DATETIME NULL;
