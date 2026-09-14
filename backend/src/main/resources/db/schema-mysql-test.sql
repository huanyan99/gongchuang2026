CREATE TABLE IF NOT EXISTS gonghcuang_user (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    openid VARCHAR(64) NOT NULL UNIQUE,
    nickname VARCHAR(64),
    avatar_url VARCHAR(512),
    name VARCHAR(64),
    gender VARCHAR(8),
    phone VARCHAR(32),
    phone_country_code VARCHAR(8),
    phone_verified_at DATETIME,
    can_invite TINYINT(1) NOT NULL DEFAULT 0,
    can_review TINYINT(1) NOT NULL DEFAULT 0,
    device_id    VARCHAR(64),
    token VARCHAR(64) UNIQUE,
    token_expire DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS gonghcuang_invitation (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(16) NOT NULL UNIQUE,
    max_uses INT NOT NULL DEFAULT 100,
    used_count INT NOT NULL DEFAULT 0,
    inviter_user_id BIGINT,
    inviter_name VARCHAR(64),
    event_city VARCHAR(32),
    guest_name VARCHAR(64),
    guest_company VARCHAR(128),
    guest_phone VARCHAR(20),
    note VARCHAR(256),
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS gonghcuang_application (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNIQUE,
    invitation_code VARCHAR(16) NOT NULL,
    name VARCHAR(64) NOT NULL,
    phone VARCHAR(20) NOT NULL UNIQUE,
    company VARCHAR(128),
    position VARCHAR(64),
    reason VARCHAR(512),
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    review_remark VARCHAR(512),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME,
    checked_in_at DATETIME,
    edit_count INT NOT NULL DEFAULT 0,
    KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS gonghcuang_lottery_draw (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE,
    lucky_code VARCHAR(4) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS gonghcuang_application_guest (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    application_id BIGINT NOT NULL,
    guest_index INT NOT NULL,
    name VARCHAR(64) NOT NULL,
    company VARCHAR(128), gender VARCHAR(8) NOT NULL, phone VARCHAR(20) NOT NULL,
    position VARCHAR(64), accommodation VARCHAR(16) NOT NULL,
    room_type VARCHAR(64) NOT NULL, checkin_date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY idx_application_id (application_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS gonghcuang_event_weather (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    city VARCHAR(32) NOT NULL UNIQUE,
    location_id VARCHAR(32),
    event_date DATE NOT NULL,
    temp_min INT,
    temp_max INT,
    weather_text VARCHAR(32),
    icon VARCHAR(16),
    tip VARCHAR(128),
    updated_at DATETIME
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO gonghcuang_invitation (code, max_uses, used_count)
VALUES ('TEST2026', 100, 0)
ON DUPLICATE KEY UPDATE max_uses = VALUES(max_uses);

INSERT INTO gonghcuang_event_weather
(city, location_id, event_date, temp_min, temp_max, weather_text, icon, tip, updated_at)
VALUES
  ('佛山', '113.12,23.02', '2026-09-18', NULL, NULL, NULL, NULL, '临近活动日期将自动更新天气', NULL),
  ('济南', '116.98,36.67', '2026-09-22', NULL, NULL, NULL, NULL, '临近活动日期将自动更新天气', NULL),
  ('上海', '121.47,31.23', '2026-10-21', NULL, NULL, NULL, NULL, '临近活动日期将自动更新天气', NULL)
  ON DUPLICATE KEY UPDATE
  location_id=VALUES(location_id), event_date=VALUES(event_date);

CREATE TABLE IF NOT EXISTS gonghcuang_seat (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_city VARCHAR(32) NOT NULL,
    name VARCHAR(64) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    table_no VARCHAR(32) NOT NULL,
    remark VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_city_phone (event_city, phone),
    KEY idx_city_table (event_city, table_no)
) ENGINE=InnoDB DEFAULT CHARSET utf8mb4;

CREATE TABLE IF NOT EXISTS gonghcuang_setting (
    setting_key VARCHAR(64) PRIMARY KEY,
    setting_value VARCHAR(255),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET utf8mb4;

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

CREATE TABLE IF NOT EXISTS gonghcuang_login_audit (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT,
    login_type VARCHAR(32) NOT NULL,
    result VARCHAR(16) NOT NULL,
    reason VARCHAR(128),
    device_hash VARCHAR(32),
    ip_address VARCHAR(64),
    user_agent VARCHAR(255),
    admin_id BIGINT,
    admin_name VARCHAR(64),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_login_audit_user_time (user_id, created_at),
    KEY idx_login_audit_result_time (result, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
