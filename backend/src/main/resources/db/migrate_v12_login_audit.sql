-- v12：登录设备审计。仅新增表，不修改或删除现有数据。
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
