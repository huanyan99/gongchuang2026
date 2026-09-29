package com.example.app.service;

import com.example.app.entity.Application;
import com.example.app.entity.Invitation;
import com.example.app.entity.User;
import com.example.app.mapper.SeatMapper;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** 场次桌位图可见性：关闭的场次不下发任何桌位数据 */
class SeatServiceVisibilityTest {

    final SeatMapper seatMapper = mock(SeatMapper.class);
    final ApplicationService applicationService = mock(ApplicationService.class);
    final InvitationService invitationService = mock(InvitationService.class);
    final SettingService settingService = mock(SettingService.class);
    final SeatService service = new SeatService(seatMapper, applicationService, invitationService, settingService);

    @Test
    void hiddenCityReturnsNoSeatData() {
        User user = new User();
        user.setId(1L);
        user.setPhone("13800000001");
        Application application = new Application();
        application.setId(10L);
        application.setStatus("APPROVED");
        application.setInvitationCode("CODE1");
        Invitation invitation = new Invitation();
        invitation.setCode("CODE1");
        invitation.setEventCity("上海");

        when(applicationService.findForAttendee(user)).thenReturn(application);
        when(invitationService.getByCode("CODE1")).thenReturn(invitation);
        when(settingService.isSeatVisible("上海")).thenReturn(false);

        Map<String, Object> body = service.mySeat(user);

        assertEquals(false, body.get("visible"));
        assertEquals("上海", body.get("eventCity"));
        assertEquals(false, body.get("published"));
        assertEquals(0, ((java.util.List<?>) body.get("mySeats")).size());
        // 关键：未开放时连桌位表都不查，避免任何桌位数据外泄
        verify(seatMapper, never()).selectList(any());
    }

    @Test
    void visibleCityKeepsReturningMySeats() {
        User user = new User();
        user.setId(1L);
        user.setPhone("13800000001");
        Application application = new Application();
        application.setId(10L);
        application.setStatus("APPROVED");
        application.setInvitationCode("CODE1");
        application.setPhone("13800000001");
        Invitation invitation = new Invitation();
        invitation.setCode("CODE1");
        invitation.setEventCity("济南");

        when(applicationService.findForAttendee(user)).thenReturn(application);
        when(invitationService.getByCode("CODE1")).thenReturn(invitation);
        when(settingService.isSeatVisible("济南")).thenReturn(true);
        when(applicationService.loadGuests(10L)).thenReturn(java.util.List.of());
        com.example.app.entity.Seat seat = new com.example.app.entity.Seat();
        seat.setEventCity("济南");
        seat.setPhone("13800000001");
        seat.setName("张三");
        seat.setTableNo("3桌");
        when(seatMapper.selectList(any())).thenReturn(java.util.List.of(seat));

        Map<String, Object> body = service.mySeat(user);

        assertEquals(true, body.get("visible"));
        assertEquals(true, body.get("published"));
        @SuppressWarnings("unchecked")
        java.util.List<Map<String, Object>> seats = (java.util.List<Map<String, Object>>) body.get("mySeats");
        assertEquals(1, seats.size());
        assertEquals("3桌", seats.get(0).get("tableNo"));
    }
}
