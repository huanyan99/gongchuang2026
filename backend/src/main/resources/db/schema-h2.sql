CREATE TABLE IF NOT EXISTS gonghcuang_user (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    openid VARCHAR(64) NOT NULL UNIQUE,
    nickname VARCHAR(64),
    avatar_url VARCHAR(512),
    token VARCHAR(64) UNIQUE,
    token_expire TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gonghcuang_invitation (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(16) NOT NULL UNIQUE,
    max_uses INT NOT NULL DEFAULT 100,
    used_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP,
    checked_in_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_application_status ON gonghcuang_application(status);

CREATE TABLE IF NOT EXISTS gonghcuang_lottery_draw (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE,
    lucky_code VARCHAR(4) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
    updated_at TIMESTAMP
);

MERGE INTO gonghcuang_invitation (code, max_uses, used_count)
KEY(code) VALUES ('TEST2026', 100, 0);

MERGE INTO gonghcuang_event_weather
(city, location_id, event_date, temp_min, temp_max, weather_text, icon, tip, updated_at)
KEY(city) VALUES
('佛山', '113.12,23.02', DATE '2026-09-18', 23, 30, '小雨', 'rainy', '请备好雨具，预留抵达时间', CURRENT_TIMESTAMP),
('济南', '116.98,36.67', DATE '2026-09-22', 17, 28, '多云', 'cloudy', '早晚温差明显，建议携带薄外套', CURRENT_TIMESTAMP),
('上海', '121.47,31.23', DATE '2026-10-21', 20, 25, '待更新', 'cloudy', '临近活动日期将自动更新天气', CURRENT_TIMESTAMP);
