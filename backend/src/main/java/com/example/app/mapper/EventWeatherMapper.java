package com.example.app.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.example.app.entity.EventWeather;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface EventWeatherMapper extends BaseMapper<EventWeather> {
}
