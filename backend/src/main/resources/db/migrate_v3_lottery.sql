USE wechat_app;

CREATE TABLE IF NOT EXISTS gonghcuang_lottery_draw (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT NOT NULL UNIQUE,
    lucky_code  VARCHAR(4) NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET utf8mb4;
