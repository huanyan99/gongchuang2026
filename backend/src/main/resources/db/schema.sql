CREATE DATABASE IF NOT EXISTS wechat_app DEFAULT CHARSET utf8mb4;
USE wechat_app;

CREATE TABLE IF NOT EXISTS gonghcuang_user (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    openid       VARCHAR(64) NOT NULL UNIQUE,
    nickname     VARCHAR(64),
    avatar_url   VARCHAR(512),
    token        VARCHAR(64) UNIQUE,
    token_expire DATETIME,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET utf8mb4;

CREATE TABLE IF NOT EXISTS gonghcuang_invitation (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    code        VARCHAR(16) NOT NULL UNIQUE,
    max_uses    INT NOT NULL DEFAULT 100,
    used_count  INT NOT NULL DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET utf8mb4;

CREATE TABLE IF NOT EXISTS gonghcuang_application (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT,
    invitation_code VARCHAR(16) NOT NULL,
    name            VARCHAR(64) NOT NULL,
    phone           VARCHAR(20) NOT NULL UNIQUE,
    company         VARCHAR(128),
    position        VARCHAR(64),
    reason          VARCHAR(512),
    status          VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    review_remark   VARCHAR(512),
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    reviewed_at     DATETIME,
    checked_in_at   DATETIME,
    KEY idx_status (status),
    UNIQUE KEY uk_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET utf8mb4;

CREATE TABLE IF NOT EXISTS gonghcuang_lottery_draw (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT NOT NULL UNIQUE,
    lucky_code  VARCHAR(4) NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET utf8mb4;
