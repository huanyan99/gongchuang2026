-- 上线新版后端前执行。只建新登记的并发占位表，不回填、不修改历史登记。
CREATE TABLE IF NOT EXISTS gonghcuang_registration_identity (
    identity_key CHAR(64) PRIMARY KEY,
    application_id BIGINT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY idx_registration_identity_application (application_id)
) ENGINE=InnoDB DEFAULT CHARSET utf8mb4;
