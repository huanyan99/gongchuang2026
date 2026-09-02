package com.example.app.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.example.app.entity.Invitation;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface InvitationMapper extends BaseMapper<Invitation> {

    /**
     * 原子扣减邀请码可用次数：只在 used_count < max_uses 时生效。
     * 返回受影响行数，0 表示已被并发请求用完。
     */
    @Update("UPDATE gonghcuang_invitation SET used_count = used_count + 1 " +
            "WHERE id = #{id} AND used_count < max_uses")
    int consumeUse(@Param("id") Long id);

    /** 用户被拒绝后改用其他场次邀请码时，归还原邀请码的一次使用名额。 */
    @Update("UPDATE gonghcuang_invitation SET used_count = used_count - 1 " +
            "WHERE id = #{id} AND used_count > 0")
    int releaseUse(@Param("id") Long id);
}
