package com.example.app.service;

import com.example.app.common.BizException;
import com.example.app.controller.ApplyController;
import com.example.app.config.UserContext;
import com.example.app.dto.ApplyRequest;
import com.example.app.entity.*;
import com.example.app.mapper.*;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AttendeeRegistrationTest {
    private final ApplicationMapper applications = mock(ApplicationMapper.class);
    private final ApplicationGuestMapper guests = mock(ApplicationGuestMapper.class);
    private final ApplicationService service = new ApplicationService(applications,
        mock(InvitationService.class), mock(InvitationMapper.class), mock(CheckinTokenService.class),
        mock(QrCodeService.class), guests, mock(LuckyCodeGeneratorService.class));

    private User companion() {
        User user = new User(); user.setId(2L); user.setPhone("13800000002"); return user;
    }
    private Application linkCompanion(String status) {
        Application a = new Application(); a.setId(10L); a.setUserId(1L); a.setStatus(status);
        ApplicationGuest b = new ApplicationGuest(); b.setApplicationId(10L); b.setPhone("13800000002");
        when(guests.selectList(any())).thenReturn(List.of(b));
        when(applications.selectById(10L)).thenReturn(a);
        return a;
    }
    @Test void companionSeesSameRegistrationForAllReviewStates() {
        for (String status : List.of("PENDING", "APPROVED", "REJECTED")) {
            Application group = linkCompanion(status);
            assertSame(group, service.findForAttendee(companion()));
        }
    }
    @Test void companionCannotModifyGroupOrSubmitAnotherRegistration() {
        linkCompanion("APPROVED");
        assertThrows(BizException.class, () -> service.resubmit(new ApplyRequest(), companion()));
        ApplyRequest request = new ApplyRequest();
        com.example.app.dto.GuestRequest guest = new com.example.app.dto.GuestRequest();
        guest.setPhone("13800000002");
        request.setAttendees(List.of(guest));
        assertThrows(BizException.class, () -> service.submit(request, companion()));
        verify(applications, never()).updateById(any(Application.class));
        verify(guests, never()).delete(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class));
    }
    @Test void registrationResponseContainsGroupAndViewerSpecificPermissions() {
        ApplicationService lookup = mock(ApplicationService.class);
        InvitationService invitations = mock(InvitationService.class);
        Application group = new Application(); group.setId(10L); group.setUserId(1L); group.setInvitationCode("INVITE");
        ApplicationGuest a = new ApplicationGuest(); a.setName("A"); a.setPhone("13800000001");
        ApplicationGuest b = new ApplicationGuest(); b.setName("B"); b.setPhone("13800000002"); b.setGender("女");
        when(lookup.findForAttendee(any())).thenReturn(group);
        when(lookup.loadGuests(10L)).thenReturn(List.of(a,b));
        Invitation inv = new Invitation(); inv.setEventCity("佛山");
        when(invitations.getByCode("INVITE")).thenReturn(inv);
        ApplyController controller = new ApplyController(lookup,invitations);
        try {
            UserContext.set(companion());
            Application response = controller.me().getData();
            assertEquals(2,response.getAttendees().size());
            assertFalse(response.getCanEdit());
            assertEquals("B",response.getViewerName());
            assertEquals("女",response.getViewerGender());
            User owner = new User(); owner.setId(1L); owner.setPhone("13800000001");
            UserContext.set(owner);
            assertTrue(controller.me().getData().getCanEdit());
        } finally { UserContext.clear(); }
    }
    @Test void unrelatedPhoneHasNoAccess() {
        when(guests.selectList(any())).thenReturn(List.of());
        assertNull(service.findForAttendee(companion()));
    }
    @Test void duplicatePhonesRejectedOnSubmitAndEditBeforeWriting() {
        com.example.app.dto.GuestRequest first = new com.example.app.dto.GuestRequest();
        first.setPhone("13800000001");
        com.example.app.dto.GuestRequest second = new com.example.app.dto.GuestRequest();
        second.setPhone(" 13800000001 ");
        ApplyRequest request = new ApplyRequest(); request.setAttendees(List.of(first, second));
        assertTrue(assertThrows(BizException.class, () -> service.submit(request, companion())).getMessage().contains("手机号重复"));
        Application owned = new Application(); owned.setId(10L); owned.setUserId(2L);
        when(applications.selectOne(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class))).thenReturn(owned);
        assertTrue(assertThrows(BizException.class, () -> service.resubmit(request, companion())).getMessage().contains("手机号重复"));
        verify(guests, never()).delete(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class));
        verify(applications, never()).insert(any(Application.class));
    }
    @Test void companionLotteryUsesOwnAccountAndSharedApproval() {
        linkCompanion("APPROVED");
        LuckyCodeGeneratorService generator = mock(LuckyCodeGeneratorService.class);
        LotteryDraw own = new LotteryDraw(); own.setLuckyCode("1234"); own.setUserId(2L);
        when(generator.getOrCreate(2L)).thenReturn(own);
        SettingService settings = mock(SettingService.class);
        InvitationService invitations = mock(InvitationService.class);
        Invitation invitation = new Invitation(); invitation.setEventCity("佛山");
        when(invitations.getByCode(any())).thenReturn(invitation);
        when(settings.isLotteryOpen("佛山")).thenReturn(true);
        LotteryService lottery = new LotteryService(service, generator, settings, invitations);
        assertEquals("1234", lottery.get(companion()).getLuckyCode());
        verify(generator).getOrCreate(2L);
        verify(generator, never()).getOrCreate(1L);
        linkCompanion("PENDING");
        assertThrows(BizException.class, () -> lottery.get(companion()));
        linkCompanion("REJECTED");
        assertThrows(BizException.class, () -> lottery.get(companion()));
    }
}
