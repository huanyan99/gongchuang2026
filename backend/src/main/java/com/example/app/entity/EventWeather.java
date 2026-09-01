package com.example.app.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("gonghcuang_event_weather")
public class EventWeather {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String city;
    private String locationId;
    private LocalDate eventDate;
    private Integer tempMin;
    private Integer tempMax;
    private String weatherText;
    private String icon;
    private String tip;
    private LocalDateTime updatedAt;
}
