package com.example.app.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.example.app.entity.Application;
import com.example.app.dto.AttendeeExportRow;
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

    /** 导出专用查询：在数据库中一次完成关联和签到汇总，避免远程库多次往返及全表搬运。 */
    @Select("<script>" +
            "SELECT a.id AS application_id, g.id AS guest_id, " +
            "CASE WHEN g.phone = a.phone THEN '主联系人' ELSE '同行人' END AS registration_role, " +
            "a.name AS contact_name, a.phone AS contact_phone, i.event_city, s.table_no, " +
            "g.name, g.gender, g.phone, g.company, g.position, g.accommodation, g.room_type, g.checkin_date, " +
            "a.status, a.reason, a.review_remark, a.reviewed_at, a.edit_count, a.invitation_code, " +
            "a.created_at, a.checked_in_at, " +
            "(SELECT COUNT(*) FROM gonghcuang_checkin_record c WHERE c.application_id = a.id AND c.phone = g.phone AND c.event_city = i.event_city) AS attendance_count, " +
            "(SELECT MIN(scanned_at) FROM gonghcuang_checkin_record c WHERE c.application_id = a.id AND c.phone = g.phone AND c.event_city = i.event_city) AS first_attendance_at, " +
            "(SELECT MAX(scanned_at) FROM gonghcuang_checkin_record c WHERE c.application_id = a.id AND c.phone = g.phone AND c.event_city = i.event_city) AS last_attendance_at " +
            "FROM gonghcuang_application a " +
            "JOIN gonghcuang_application_guest g ON g.application_id = a.id " +
            "JOIN gonghcuang_invitation i ON i.code = a.invitation_code " +
            "LEFT JOIN gonghcuang_seat s ON s.event_city = i.event_city AND s.phone = g.phone " +
            "<where>" +
            "g.id &gt; #{afterGuestId} " +
            "<if test='city != null and city != \"\"'> AND i.event_city = #{city} </if>" +
            "<if test='status != null and status != \"\"'> AND a.status = #{status} </if>" +
            "</where> ORDER BY g.id LIMIT #{limit}" +
            "</script>")
    List<AttendeeExportRow> selectAttendeeExport(@Param("city") String city, @Param("status") String status,
                                                @Param("afterGuestId") long afterGuestId, @Param("limit") int limit);

    @Update("UPDATE gonghcuang_application SET invitation_code=#{invitationCode}, name=#{name}, phone=#{phone}, company=#{company}, " +
            "position=#{position}, reason=#{reason}, status='PENDING', review_remark=NULL, " +
            "reviewed_at=NULL, checked_in_at=NULL, edit_count=edit_count+1 WHERE id=#{id} AND edit_count<2")
    int resubmit(@Param("id") Long id, @Param("invitationCode") String invitationCode,
                 @Param("name") String name, @Param("phone") String phone,
                 @Param("company") String company, @Param("position") String position,
                 @Param("reason") String reason);
}
