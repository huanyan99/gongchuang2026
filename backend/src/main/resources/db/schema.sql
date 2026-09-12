CREATE DATABASE IF NOT EXISTS wechat_app DEFAULT CHARSET utf8mb4;
USE wechat_app;

CREATE TABLE IF NOT EXISTS gonghcuang_user (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    openid       VARCHAR(64) NOT NULL UNIQUE,
    nickname     VARCHAR(64),
    avatar_url   VARCHAR(512),
    name VARCHAR(64),
    gender VARCHAR(8),
    phone VARCHAR(32),
    phone_country_code VARCHAR(8),
    phone_verified_at DATETIME,
    can_invite   TINYINT(1) NOT NULL DEFAULT 0,
    can_review   TINYINT(1) NOT NULL DEFAULT 0,
    token        VARCHAR(64) UNIQUE,
    token_expire DATETIME,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET utf8mb4;

CREATE TABLE IF NOT EXISTS gonghcuang_invitation (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    code        VARCHAR(16) NOT NULL UNIQUE,
    max_uses    INT NOT NULL DEFAULT 100,
    used_count  INT NOT NULL DEFAULT 0,
    inviter_user_id BIGINT,
    inviter_name VARCHAR(64),
    event_city VARCHAR(32),
    guest_name VARCHAR(64),
    guest_company VARCHAR(128),
    guest_phone VARCHAR(20),
    note VARCHAR(256),
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    expires_at DATETIME,
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
    edit_count      INT NOT NULL DEFAULT 0,
    KEY idx_status (status),
    UNIQUE KEY uk_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET utf8mb4;

CREATE TABLE IF NOT EXISTS gonghcuang_lottery_draw (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT NOT NULL UNIQUE,
    lucky_code  VARCHAR(4) NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET utf8mb4;

CREATE TABLE IF NOT EXISTS gonghcuang_application_guest (
    id BIGINT AUTO_INCREMENT PRIMARY KEY, application_id BIGINT NOT NULL, guest_index INT NOT NULL,
    name VARCHAR(64) NOT NULL, company VARCHAR(128), gender VARCHAR(8) NOT NULL, phone VARCHAR(20) NOT NULL,
    position VARCHAR(64), accommodation VARCHAR(16) NOT NULL, room_type VARCHAR(64) NOT NULL,
    checkin_date DATE NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY idx_application_id (application_id)
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

CREATE TABLE IF NOT EXISTS gonghcuang_seat (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_city VARCHAR(32) NOT NULL,
    name VARCHAR(64) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    table_no VARCHAR(32) NOT NULL,
    seat_no VARCHAR(16),
    remark VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_city_phone (event_city, phone),
    KEY idx_city_table (event_city, table_no)
) ENGINE=InnoDB DEFAULT CHARSET utf8mb4;
