package com.example.app.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.example.app.common.ApplyStatus;
import com.example.app.common.BizException;
import com.example.app.common.ErrorCode;
import com.example.app.entity.Application;
import com.example.app.entity.ApplicationGuest;
import com.example.app.entity.Seat;
import com.example.app.entity.User;
import com.example.app.mapper.SeatMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 嘉宾端桌位图。
 * 只返回本人及同行人的桌号，不下发其他嘉宾的姓名和手机号。
 * 桌位的维护（建桌、拖动分配）在后台看板，见 SeatBoardService。
 */
@Service
@RequiredArgsConstructor
public class SeatService {

    private final SeatMapper seatMapper;
    private final ApplicationService applicationService;
    private final InvitationService invitationService;
    private final SettingService settingService;

    /** 场次桌位图是否对嘉宾开放（公开接口用，只回布尔） */
    public boolean isSeatVisible(String eventCity) {
        return settingService.isSeatVisible(eventCity);
    }

    /** 当前登录嘉宾的桌位 */
    public Map<String, Object> mySeat(User user) {
        Application application = applicationService.findForAttendee(user);
        if (application == null) {
            throw new BizException(ErrorCode.APPLY_NOT_FOUND);
        }
        if (!ApplyStatus.APPROVED.name().equals(application.getStatus())) {
            throw new BizException(ErrorCode.SEAT_NOT_APPROVED);
        }

        String eventCity = invitationService.getByCode(application.getInvitationCode()).getEventCity();

        // 场次未开放时不返回任何桌位数据，嘉宾端按「暂未更新」处理
        if (!settingService.isSeatVisible(eventCity)) {
            Map<String, Object> hidden = new LinkedHashMap<>();
            hidden.put("eventCity", eventCity);
            hidden.put("visible", false);
            hidden.put("published", false);
            hidden.put("mySeats", List.of());
            return hidden;
        }

        List<Seat> citySeats = listByCity(eventCity);

        Set<String> myPhones = new LinkedHashSet<>();
        if (application.getPhone() != null) myPhones.add(application.getPhone());
        for (ApplicationGuest guest : applicationService.loadGuests(application.getId())) {
            if (guest.getPhone() != null) myPhones.add(guest.getPhone());
        }

        // 只返回本人及同行人的桌号，不下发其他嘉宾信息
        List<Map<String, Object>> mySeats = new ArrayList<>();
        for (Seat seat : citySeats) {
            if (!myPhones.contains(seat.getPhone())) continue;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("name", seat.getName());
            row.put("tableNo", seat.getTableNo());
            mySeats.add(row);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("eventCity", eventCity);
        body.put("visible", true);
        body.put("published", !citySeats.isEmpty());
        body.put("mySeats", mySeats);
        return body;
    }

    private List<Seat> listByCity(String eventCity) {
        if (eventCity == null || eventCity.isEmpty()) return List.of();
        return seatMapper.selectList(new LambdaQueryWrapper<Seat>()
                .eq(Seat::getEventCity, eventCity)
                .orderByAsc(Seat::getId));
    }
}
