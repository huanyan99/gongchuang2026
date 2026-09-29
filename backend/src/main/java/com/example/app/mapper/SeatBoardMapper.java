package com.example.app.mapper;

import com.example.app.dto.SeatBoardPerson;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/** 桌位看板的跨表查询：名单来自登记，桌号来自桌位表。 */
@Mapper
public interface SeatBoardMapper {

    /**
     * 本场次审核通过的全体参会人（含主联系人与同行人），带出各自当前桌号。
     * 只有这些人能出现在看板左侧——嘉宾端也只会按这个集合匹配桌位。
     */
    @Select("SELECT a.id AS application_id, g.phone AS phone, g.name AS name, g.company AS company, " +
            "g.position AS position, a.phone AS contact_phone, s.table_no AS table_no " +
            "FROM gonghcuang_application a " +
            "JOIN gonghcuang_invitation i ON i.code = a.invitation_code " +
            "JOIN gonghcuang_application_guest g ON g.application_id = a.id " +
            "LEFT JOIN gonghcuang_seat s ON s.event_city = i.event_city AND s.phone = g.phone " +
            "WHERE a.status = 'APPROVED' AND i.event_city = #{city} " +
            "ORDER BY g.company, g.id")
    List<SeatBoardPerson> selectRoster(@Param("city") String city);

    /** 本场次审核通过的参会人总数 */
    @Select("SELECT COUNT(*) FROM gonghcuang_application a " +
            "JOIN gonghcuang_invitation i ON i.code = a.invitation_code " +
            "JOIN gonghcuang_application_guest g ON g.application_id = a.id " +
            "WHERE a.status = 'APPROVED' AND i.event_city = #{city}")
    int countRoster(@Param("city") String city);

    /** 本场次已分配桌位的参会人数（只统计能对上登记的，孤儿行不算） */
    @Select("SELECT COUNT(*) FROM gonghcuang_seat s WHERE s.event_city = #{city} AND EXISTS (" +
            "SELECT 1 FROM gonghcuang_application a " +
            "JOIN gonghcuang_invitation i ON i.code = a.invitation_code " +
            "JOIN gonghcuang_application_guest g ON g.application_id = a.id " +
            "WHERE i.event_city = s.event_city AND g.phone = s.phone AND a.status = 'APPROVED')")
    int countAssigned(@Param("city") String city);

    /** 本场次手机号对不上任何已通过登记的桌位行数（历史导入留下的死数据，保存时清理） */
    @Select("SELECT COUNT(*) FROM gonghcuang_seat s WHERE s.event_city = #{city} AND NOT EXISTS (" +
            "SELECT 1 FROM gonghcuang_application a " +
            "JOIN gonghcuang_invitation i ON i.code = a.invitation_code " +
            "JOIN gonghcuang_application_guest g ON g.application_id = a.id " +
            "WHERE i.event_city = s.event_city AND g.phone = s.phone AND a.status = 'APPROVED')")
    int countOrphanSeats(@Param("city") String city);

    /** 场次级互斥锁：需要在同一个连接里取锁与释放，调用方用 finally 保证释放 */
    @Select("SELECT GET_LOCK(#{name}, #{timeoutSeconds})")
    Integer acquireLock(@Param("name") String name, @Param("timeoutSeconds") int timeoutSeconds);

    @Select("SELECT RELEASE_LOCK(#{name})")
    Integer releaseLock(@Param("name") String name);
}
