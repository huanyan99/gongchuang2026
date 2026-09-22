package com.example.app.service;

import com.example.app.mapper.ApplicationMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("dev")
@Transactional
class AttendeeExportQueryTest {
    @Autowired JdbcTemplate jdbc;
    @Autowired ApplicationMapper mapper;
    @Autowired ApplicationService applications;

    @Test void reviewSearchFindsCompanionNameAndKeepsCityStatusFilters() {
        jdbc.update("INSERT INTO gonghcuang_invitation(code,event_city) VALUES (?,?)", "SEARCHSH", "上海");
        jdbc.update("INSERT INTO gonghcuang_application(invitation_code,name,phone,status) VALUES (?,?,?,?)",
                "SEARCHSH", "主联系人", "13900008881", "PENDING");
        Long applicationId = jdbc.queryForObject("SELECT id FROM gonghcuang_application WHERE phone=?", Long.class, "13900008881");
        jdbc.update("INSERT INTO gonghcuang_application_guest(application_id,guest_index,name,gender,phone,accommodation,room_type,checkin_date) VALUES (?,?,?,?,?,?,?,CURRENT_DATE)",
                applicationId, 1, "王小明", "男", "13900008882", "否", "无");
        var matching = applications.page(1, 20, "PENDING", "上海", "小明");
        assertEquals(1, matching.getTotal());
        assertEquals("王小明", matching.getRecords().get(0).getAttendees().get(0).getName());
        assertEquals(0, applications.page(1, 20, "APPROVED", "上海", "小明").getTotal());
        assertEquals(0, applications.page(1, 20, "PENDING", "佛山", "小明").getTotal());
        assertEquals(1, applications.page(1, 20, "PENDING", "上海", "主联系").getTotal());
    }

    @Test void reviewSearchMatchesMainAndCompanionPhones() {
        jdbc.update("INSERT INTO gonghcuang_invitation(code,event_city) VALUES (?,?)", "PHONESH", "上海");
        jdbc.update("INSERT INTO gonghcuang_application(invitation_code,name,phone,status) VALUES (?,?,?,?)",
                "PHONESH", "主联系人", "13900007771", "PENDING");
        Long applicationId = jdbc.queryForObject("SELECT id FROM gonghcuang_application WHERE phone=?", Long.class, "13900007771");
        jdbc.update("INSERT INTO gonghcuang_application_guest(application_id,guest_index,name,gender,phone,accommodation,room_type,checkin_date) VALUES (?,?,?,?,?,?,?,CURRENT_DATE)",
                applicationId, 1, "同行人", "男", "13900007772", "否", "无");
        // 主联系人手机号（完整与尾号片段）
        assertEquals(1, applications.page(1, 20, null, null, "13900007771").getTotal());
        assertEquals(1, applications.page(1, 20, null, null, "0007771").getTotal());
        // 同行人手机号
        assertEquals(1, applications.page(1, 20, null, null, "13900007772").getTotal());
        // 姓名搜索不受影响
        assertEquals(1, applications.page(1, 20, null, null, "同行人").getTotal());
        assertEquals(0, applications.page(1, 20, null, null, "13900009999").getTotal());
    }

    @Test void filtersOldCityAttendanceAndPagesByGuestId() {
        jdbc.update("INSERT INTO gonghcuang_invitation(code,event_city) VALUES (?,?)", "EXPORTSH", "上海");
        jdbc.update("INSERT INTO gonghcuang_application(invitation_code,name,phone) VALUES (?,?,?)", "EXPORTSH", "测试", "13900009991");
        Long applicationId = jdbc.queryForObject("SELECT id FROM gonghcuang_application WHERE phone=?", Long.class, "13900009991");
        jdbc.update("INSERT INTO gonghcuang_application_guest(application_id,guest_index,name,gender,phone,accommodation,room_type,checkin_date) VALUES (?,?,?,?,?,?,?,CURRENT_DATE)",
                applicationId, 1, "测试", "男", "13900009991", "否", "无");
        Long guestId = jdbc.queryForObject("SELECT id FROM gonghcuang_application_guest WHERE phone=?", Long.class, "13900009991");
        jdbc.update("INSERT INTO gonghcuang_checkin_record(application_id,user_id,phone,name,event_city,scanned_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)",
                applicationId, 1, "13900009991", "测试", "佛山");
        var page = mapper.selectAttendeeExport("上海", "", 0, 1);
        assertEquals(1, page.size());
        assertEquals(guestId, page.get(0).getGuestId());
        assertEquals(0, page.get(0).getAttendanceCount());
        assertTrue(mapper.selectAttendeeExport("上海", "", guestId, 1).isEmpty());
    }
}
