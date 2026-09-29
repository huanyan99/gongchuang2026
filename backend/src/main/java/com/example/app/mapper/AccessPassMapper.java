package com.example.app.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.example.app.entity.AccessPass;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface AccessPassMapper extends BaseMapper<AccessPass> {

    /** 只在启用状态下停用，返回 1 表示这次真的停用了（重复点击得到 0） */
    @Update("UPDATE gonghcuang_access_pass SET enabled = 0 WHERE id = #{id} AND enabled = 1")
    int disableIfEnabled(@Param("id") Long id);
}
