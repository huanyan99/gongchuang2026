CREATE DATABASE IF NOT EXISTS wechat_app DEFAULT CHARSET utf8mb4;
USE wechat_app;

CREATE TABLE IF NOT EXISTS t_user (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    openid      VARCHAR(64) NOT NULL UNIQUE,
    nickname    VARCHAR(64),
    avatar_url  VARCHAR(512),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS t_invitation (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    code        VARCHAR(16) NOT NULL UNIQUE,
    max_uses    INT NOT NULL DEFAULT 100,
    used_count  INT NOT NULL DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS t_application (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
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
    KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
