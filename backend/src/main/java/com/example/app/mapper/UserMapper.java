package com.example.app.mapper;

import com.example.app.entity.User;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface UserMapper {
    User selectByOpenid(@Param("openid") String openid);
    int insert(User user);
}
