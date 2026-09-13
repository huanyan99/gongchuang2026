-- v10：登录设备绑定与后台开关。
-- device_id 由客户端首次登录时生成并保存在本机；邀请人换设备需管理员解绑。
ALTER TABLE gonghcuang_user
    ADD COLUMN device_id VARCHAR(64) NULL;

CREATE TABLE IF NOT EXISTS gonghcuang_setting (
    setting_key VARCHAR(64) PRIMARY KEY,
    setting_value VARCHAR(255),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET utf8mb4;
