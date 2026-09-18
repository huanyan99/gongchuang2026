
-- 嘉宾扫码签到：每次扫码新增一条，同行人按手机号分别记录。
CREATE TABLE IF NOT EXISTS gonghcuang_checkin_record (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    application_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    phone VARCHAR(32) NOT NULL,
    name VARCHAR(100) NOT NULL,
    event_city VARCHAR(50),
    scanned_at DATETIME NOT NULL,
    INDEX idx_checkin_person (application_id, phone, id)
);
