package com.example.app.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.example.app.entity.Setting;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface SettingMapper extends BaseMapper<Setting> {

    /** 原子写入：并发改同一个开关不会先查后写地互相打断 */
    @Insert("INSERT INTO gonghcuang_setting (setting_key, setting_value, updated_by, updated_at) " +
            "VALUES (#{key}, #{value}, #{updatedBy}, NOW()) " +
            "ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), " +
            "updated_by = VALUES(updated_by), updated_at = NOW()")
    int upsert(@Param("key") String key, @Param("value") String value, @Param("updatedBy") String updatedBy);
}
