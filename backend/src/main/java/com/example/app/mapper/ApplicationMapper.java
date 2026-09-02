package com.example.app.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.example.app.entity.Application;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;
import java.util.Map;

@Mapper
public interface ApplicationMapper extends BaseMapper<Application> {

    /**
     * 条件更新审核状态：只在当前状态为 PENDING 时生效（乐观流转）。
     * 返回受影响行数，0 表示已被并发审核或已终态。
     */
    @Update("UPDATE gonghcuang_application SET status = #{target}, review_remark = #{remark}, reviewed_at = NOW() " +
            "WHERE id = #{id} AND status = 'PENDING'")
    int reviewIfPending(@Param("id") Long id, @Param("target") String target, @Param("remark") String remark);

    @Update("UPDATE gonghcuang_application SET checked_in_at = NOW() " +
            "WHERE id = #{id} AND status = 'APPROVED' AND checked_in_at IS NULL")
    int checkInIfApproved(@Param("id") Long id);

    @Select("SELECT status AS status, COUNT(*) AS cnt FROM gonghcuang_application GROUP BY status")
    List<Map<String, Object>> countGroupByStatus();

    @Update("UPDATE gonghcuang_application SET invitation_code=#{invitationCode}, name=#{name}, phone=#{phone}, company=#{company}, " +
            "position=#{position}, reason=#{reason}, status='PENDING', review_remark=NULL, " +
            "reviewed_at=NULL, checked_in_at=NULL, edit_count=edit_count+1 WHERE id=#{id} AND edit_count<2")
    int resubmit(@Param("id") Long id, @Param("invitationCode") String invitationCode,
                 @Param("name") String name, @Param("phone") String phone,
                 @Param("company") String company, @Param("position") String position,
                 @Param("reason") String reason);
}
