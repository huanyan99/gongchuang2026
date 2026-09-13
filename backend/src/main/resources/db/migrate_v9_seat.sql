-- v9：桌位安排。按「场次 + 手机号」唯一，批量导入时按手机号匹配参会登记的同行人。
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
