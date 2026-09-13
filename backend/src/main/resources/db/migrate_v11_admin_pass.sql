-- v11：管理后台账号密码登录 + 现场通道二维码。
-- 口令用 PBKDF2-HMAC-SHA256 加盐存储；会话 token 只存 SHA-256 摘要，库被拖走也拿不到有效会话。
CREATE TABLE IF NOT EXISTS gonghcuang_admin_user (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(64) NOT NULL UNIQUE,
    password_hash VARCHAR(128) NOT NULL,
    password_salt VARCHAR(64) NOT NULL,
    display_name VARCHAR(64),
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    failed_count INT NOT NULL DEFAULT 0,
    locked_until DATETIME,
    last_login_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET utf8mb4;

CREATE TABLE IF NOT EXISTS gonghcuang_admin_session (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    admin_id BIGINT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY idx_admin_id (admin_id)
) ENGINE=InnoDB DEFAULT CHARSET utf8mb4;

-- 现场通道：会议当天才公布的二维码参数，扫码后只验证姓名即可查看抽奖码与桌位
CREATE TABLE IF NOT EXISTS gonghcuang_access_pass (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    token VARCHAR(64) NOT NULL UNIQUE,
    event_city VARCHAR(32),
    note VARCHAR(128),
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET utf8mb4;

CREATE TABLE IF NOT EXISTS gonghcuang_pass_session (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    user_id BIGINT NOT NULL,
    pass_id BIGINT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET utf8mb4;
