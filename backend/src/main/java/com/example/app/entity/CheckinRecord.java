package com.example.app.entity;
import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;
@Data
@TableName("gonghcuang_checkin_record")
public class CheckinRecord {
    @TableId(type = IdType.AUTO) private Long id;
    private Long applicationId;
    private Long userId;
    private String phone;
    private String name;
    private String eventCity;
    private LocalDateTime scannedAt;
}
