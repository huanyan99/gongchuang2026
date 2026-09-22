package com.example.app.dto;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
public class AttendeeExportRow {
    private Long applicationId;
    private Long guestId;
    private String registrationRole;
    private String contactName;
    private String contactPhone;
    private String eventCity;
    private String tableNo;
    private String name;
    private String gender;
    private String phone;
    private String company;
    private String position;
    private String accommodation;
    private String roomType;
    private LocalDate checkinDate;
    private String status;
    private String reason;
    private String reviewRemark;
    private LocalDateTime reviewedAt;
    private Integer editCount;
    private String invitationCode;
    private LocalDateTime createdAt;
    private LocalDateTime checkedInAt;
    private Long attendanceCount;
    private LocalDateTime firstAttendanceAt;
    private LocalDateTime lastAttendanceAt;
}
