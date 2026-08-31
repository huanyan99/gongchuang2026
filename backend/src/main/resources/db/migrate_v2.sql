USE wechat_app;

ALTER TABLE t_user
    ADD COLUMN token VARCHAR(64) NULL UNIQUE AFTER avatar_url,
    ADD COLUMN token_expire DATETIME NULL AFTER token;

ALTER TABLE t_application
    ADD COLUMN user_id BIGINT NULL AFTER id,
    ADD COLUMN checked_in_at DATETIME NULL AFTER reviewed_at,
    ADD UNIQUE KEY uk_user_id (user_id);
