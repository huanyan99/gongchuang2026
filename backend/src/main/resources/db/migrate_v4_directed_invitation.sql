ALTER TABLE gonghcuang_user
    ADD COLUMN can_invite TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN can_review TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE gonghcuang_invitation
    ADD COLUMN inviter_user_id BIGINT NULL,
    ADD COLUMN inviter_name VARCHAR(64) NULL,
    ADD COLUMN event_city VARCHAR(32) NULL,
    ADD COLUMN guest_name VARCHAR(64) NULL,
    ADD COLUMN guest_company VARCHAR(128) NULL,
    ADD COLUMN guest_phone VARCHAR(20) NULL,
    ADD COLUMN note VARCHAR(256) NULL,
    ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN expires_at DATETIME NULL,
    ADD INDEX idx_inviter_user_id (inviter_user_id),
    ADD INDEX idx_event_city (event_city);
