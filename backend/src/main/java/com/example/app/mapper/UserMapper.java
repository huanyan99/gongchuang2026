package com.example.app.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.example.app.entity.User;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface UserMapper extends BaseMapper<User> {

    /**
     * 首次绑定设备：只有当前没绑定过时才写入。
     * 两台设备同时首登同一账号时由数据库保证只有一台成功（受影响行数 1），另一台拿到 0。
     */
    @Update("UPDATE gonghcuang_user SET device_id = #{deviceId} " +
            "WHERE id = #{id} AND (device_id IS NULL OR device_id = '')")
    int bindDeviceIfEmpty(@Param("id") Long id, @Param("deviceId") String deviceId);
}
