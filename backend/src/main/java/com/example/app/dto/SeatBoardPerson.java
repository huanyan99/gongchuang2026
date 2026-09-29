package com.example.app.dto;

import lombok.Data;

/** 桌位看板左侧的一位参会人（来自审核通过的登记），tableNo 为空表示尚未分配 */
@Data
public class SeatBoardPerson {

    private Long applicationId;

    private String phone;

    private String name;

    private String company;

    private String position;

    /** 登记主联系人的手机号，用于判断本人在登记里的角色 */
    private String contactPhone;

    private String tableNo;

    /** 主联系人 / 同行人 */
    private String role;
}
