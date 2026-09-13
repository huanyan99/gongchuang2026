package com.example.app.common;

import lombok.Getter;

/** 全局错误码：0 成功；1xxx 通用；2xxx 邀请码；3xxx 申报；4xxx 抽奖；5xxx 桌位；9xxx 系统 */
@Getter
public enum ErrorCode {

    SUCCESS(0, "success"),

    // 通用
    BAD_REQUEST(1000, "请求参数不合法"),
    UNAUTHORIZED(1001, "未授权或密钥错误"),
    NOT_FOUND(1002, "资源不存在"),
    CONFLICT(1003, "数据冲突，请勿重复操作"),
    DEVICE_LIMITED(1004, "该账号已绑定其他设备，请使用原设备登录"),

    // 邀请码
    INVITATION_NOT_FOUND(2001, "邀请码无效"),
    INVITATION_EXHAUSTED(2002, "该邀请码已达使用上限"),
    INVITATION_CODE_CONFLICT(2003, "邀请码冲突，请重试"),

    // 申报
    APPLY_DUPLICATED(3001, "该手机号已提交过申报，请勿重复提交"),
    APPLY_NOT_FOUND(3002, "未查询到申报记录"),
    APPLY_ALREADY_REVIEWED(3003, "该申报已审核，不可重复操作"),
    CHECKIN_INVALID(3004, "入场凭证无效"),
    CHECKIN_EXPIRED(3005, "入场凭证已过期，请刷新二维码"),
    CHECKIN_ALREADY(3006, "该嘉宾已完成入场核验"),
    CHECKIN_NOT_APPROVED(3007, "该申报尚未通过审核，无法核验入场"),

    // 抽奖
    LOTTERY_NOT_DRAWN(4001, "尚未抽取号码"),
    LOTTERY_NOT_APPROVED(4002, "参会登记审核通过后方可领取抽奖码"),

    // 桌位
    SEAT_NOT_APPROVED(5001, "参会登记审核通过后可查看桌位"),

    // 系统
    INTERNAL_ERROR(9000, "服务器内部错误"),
    WECHAT_API_ERROR(9001, "微信接口调用失败");

    private final int code;
    private final String message;

    ErrorCode(int code, String message) {
        this.code = code;
        this.message = message;
    }
}
