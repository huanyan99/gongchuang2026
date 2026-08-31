package com.example.app.mapper;

import com.example.app.entity.Invitation;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface InvitationMapper {
    int insert(Invitation invitation);
    Invitation selectByCode(@Param("code") String code);
    int increaseUsedCount(@Param("id") Long id);
}
