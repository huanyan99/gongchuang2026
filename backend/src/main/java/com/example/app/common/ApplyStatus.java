package com.example.app.common;

/** 申报审核状态：只允许 PENDING -> APPROVED / REJECTED 单向流转 */
public enum ApplyStatus {

    PENDING,
    APPROVED,
    REJECTED;

    public boolean isFinal() {
        return this != PENDING;
    }

    public static ApplyStatus of(String value) {
        if (value == null || value.isBlank()) {
            throw new BizException(ErrorCode.BAD_REQUEST, "非法的审核状态: " + value);
        }
        try {
            return valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BizException(ErrorCode.BAD_REQUEST, "非法的审核状态: " + value);
        }
    }
}
