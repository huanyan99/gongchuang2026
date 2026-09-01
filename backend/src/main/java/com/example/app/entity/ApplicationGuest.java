package com.example.app.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("gonghcuang_application_guest")
public class ApplicationGuest {
    @TableId(type = IdType.AUTO) private Long id;
    private Long applicationId;
    private Integer guestIndex;
    private String name;
    private String company;
    private String gender;
    private String phone;
    private String position;
    private String accommodation;
    private String roomType;
    private LocalDate checkinDate;
    private LocalDateTime createdAt;
}
