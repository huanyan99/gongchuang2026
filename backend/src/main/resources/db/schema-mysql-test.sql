CREATE TABLE IF NOT EXISTS gonghcuang_user (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    openid VARCHAR(64) NOT NULL UNIQUE,
    nickname VARCHAR(64),
    avatar_url VARCHAR(512),
    can_invite TINYINT(1) NOT NULL DEFAULT 0,
    can_review TINYINT(1) NOT NULL DEFAULT 0,
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
('佛山', '113.12,23.02', '2026-09-18', 23, 30, '小雨', 'rainy', '请备好雨具，预留抵达时间', NOW()),
('济南', '116.98,36.67', '2026-09-22', 17, 28, '多云', 'cloudy', '早晚温差明显，建议携带薄外套', NOW()),
('上海', '121.47,31.23', '2026-10-21', 20, 25, '待更新', 'cloudy', '临近活动日期将自动更新天气', NOW())
ON DUPLICATE KEY UPDATE
location_id=VALUES(location_id), event_date=VALUES(event_date), temp_min=VALUES(temp_min),
temp_max=VALUES(temp_max), weather_text=VALUES(weather_text), icon=VALUES(icon), tip=VALUES(tip);
