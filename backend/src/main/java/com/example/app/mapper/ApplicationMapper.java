package com.example.app.mapper;

import com.example.app.entity.Application;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface ApplicationMapper {
    int insert(Application application);
    Application selectByPhone(@Param("phone") String phone);
    Application selectById(@Param("id") Long id);
    List<Application> selectByStatus(@Param("status") String status);
    int updateStatus(@Param("id") Long id, @Param("status") String status,
                     @Param("reviewRemark") String reviewRemark);
}
