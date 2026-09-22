package com.example.app.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.example.app.common.*;
import com.example.app.entity.*;
import com.example.app.mapper.CheckinRecordMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.*;

@Service
@RequiredArgsConstructor
public class AttendanceService {
    private final ApplicationService applications;
    private final InvitationService invitations;
    private final CheckinRecordMapper records;

    @Transactional
    public CheckinRecord scan(User user) {
        Application application = applications.findForAttendee(user);
        if (application == null) throw new BizException(ErrorCode.APPLY_NOT_FOUND);
        if (!ApplyStatus.APPROVED.name().equals(application.getStatus()))
            throw new BizException(ErrorCode.CHECKIN_NOT_APPROVED);
        ApplicationGuest guest = applications.loadGuests(application.getId()).stream()
            .filter(g -> user.getPhone() != null && user.getPhone().equals(g.getPhone()))
            .findFirst().orElseThrow(() -> new BizException(ErrorCode.BAD_REQUEST, "未找到本人的参会信息，请联系工作人员"));
        Invitation invitation = invitations.getByCode(application.getInvitationCode());
        CheckinRecord record = new CheckinRecord();
        record.setApplicationId(application.getId());
        record.setUserId(user.getId());
        record.setPhone(guest.getPhone());
        record.setName(guest.getName());
        record.setEventCity(invitation == null ? "" : invitation.getEventCity());
        record.setScannedAt(LocalDateTime.now());
        records.insert(record);
        return record;
    }

    public List<Map<String, Object>> attendees(String city, String status) {
        List<Map<String, Object>> rows = applications.exportAttendees(city, status);
        if (rows.isEmpty()) return rows;
        var query = new LambdaQueryWrapper<CheckinRecord>().orderByAsc(CheckinRecord::getId);
        if (city != null && !city.isBlank()) query.eq(CheckinRecord::getEventCity, city.trim());
        Map<String, List<CheckinRecord>> byPerson = new HashMap<>();
        for (CheckinRecord record : records.selectList(query)) {
            byPerson.computeIfAbsent(record.getApplicationId() + ":" + record.getPhone() + ":" + record.getEventCity(), k -> new ArrayList<>()).add(record);
        }
        for (Map<String, Object> row : rows) {
            String eventCity = String.valueOf(row.get("场次")).replaceFirst("场$", "");
            var history = byPerson.getOrDefault(row.get("登记编号") + ":" + row.get("手机号") + ":" + eventCity, List.of());
            row.put("签到状态", history.isEmpty() ? "未签到" : "已签到");
            row.put("签到次数", history.size());
            row.put("首次签到时间", history.isEmpty() ? "" : history.get(0).getScannedAt().toString());
            row.put("最近签到时间", history.isEmpty() ? "" : history.get(history.size()-1).getScannedAt().toString());
        }
        return rows;
    }

    public Page<CheckinRecord> history(Long applicationId, String phone, long page, long size) {
        return records.selectPage(new Page<>(page, size), new LambdaQueryWrapper<CheckinRecord>()
            .eq(CheckinRecord::getApplicationId, applicationId).eq(CheckinRecord::getPhone, phone)
            .orderByDesc(CheckinRecord::getId));
    }
}
