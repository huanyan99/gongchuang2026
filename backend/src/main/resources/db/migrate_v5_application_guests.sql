CREATE TABLE IF NOT EXISTS gonghcuang_application_guest (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    application_id BIGINT NOT NULL,
    guest_index INT NOT NULL,
    name VARCHAR(64) NOT NULL,
    company VARCHAR(128),
    gender VARCHAR(8) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    position VARCHAR(64),
    accommodation VARCHAR(16) NOT NULL,
    room_type VARCHAR(64) NOT NULL,
    checkin_date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY idx_application_id (application_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
