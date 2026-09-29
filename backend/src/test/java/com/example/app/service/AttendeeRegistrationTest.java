package com.example.app.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
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
    private final InvitationMapper invitationMapper = mock(InvitationMapper.class);
    private final SeatMapper seats = mock(SeatMapper.class);
    private final InvitationService invitationService = mock(InvitationService.class);
    private final ApplicationService service = new ApplicationService(applications,
        invitationService, invitationMapper, mock(CheckinTokenService.class),
        mock(QrCodeService.class), guests, mock(LuckyCodeGeneratorService.class), seats,
        mock(RegistrationIdentityMapper.class));

    private User companion() {
        User user = new User(); user.setId(2L); user.setPhone("13800000002"); return user;
    }
    private com.example.app.dto.GuestRequest guest(String name, String company, String phone) {
        com.example.app.dto.GuestRequest guest = new com.example.app.dto.GuestRequest();
        guest.setName(name); guest.setCompany(company); guest.setPhone(phone);
        guest.setCheckinDate("2026-09-18");
        return guest;
    }
    private ApplicationGuest guestRow(Long applicationId, int guestIndex, String name, String phone) {
        ApplicationGuest guest = new ApplicationGuest();
        guest.setApplicationId(applicationId); guest.setGuestIndex(guestIndex);
        guest.setName(name); guest.setPhone(phone);
        return guest;
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
    @Test void exportIncludesRegistrationAndReviewDetailsForEachPerson() {
        Application application = new Application();
        application.setId(10L); application.setName("主联系人"); application.setPhone("13800000001");
        application.setInvitationCode("INVITE");
        application.setStatus("REJECTED"); application.setReason("参加交流"); application.setReviewRemark("信息待补充");
        application.setReviewedAt(java.time.LocalDateTime.of(2026, 9, 18, 10, 0));
        application.setCheckedInAt(java.time.LocalDateTime.of(2026, 9, 18, 11, 30));
        ApplicationGuest primary = new ApplicationGuest();
        primary.setId(11L); primary.setApplicationId(10L); primary.setPhone("13800000001");
        ApplicationGuest companion = new ApplicationGuest();
        companion.setId(12L); companion.setApplicationId(10L); companion.setPhone("13800000002");
        Invitation invitation = new Invitation(); invitation.setCode("INVITE"); invitation.setEventCity("佛山");
        when(invitationMapper.selectList(any())).thenReturn(List.of(invitation));
        Seat seat = new Seat(); seat.setEventCity("佛山"); seat.setPhone("13800000002"); seat.setTableNo("8桌");
        when(seats.selectList(any())).thenReturn(List.of(seat));
        when(applications.selectList(any())).thenReturn(List.of(application));
        when(guests.selectList(any())).thenReturn(List.of(primary, companion));
        var rows = service.exportAttendees(null, null);
        assertEquals(2, rows.size());
        assertEquals("主联系人", rows.get(0).get("登记身份"));
        assertEquals("同行人", rows.get(1).get("登记身份"));
        assertEquals(12L, rows.get(1).get("参会人编号"));
        assertEquals("8桌", rows.get(1).get("桌号"));
        assertEquals("", rows.get(0).get("桌号"));
        for (var row : rows) {
            assertEquals("13800000001", row.get("主联系人手机号"));
            assertEquals("REJECTED", row.get("审核状态"));
            assertEquals("参加交流", row.get("申请原因"));
            assertEquals("信息待补充", row.get("审核备注"));
            assertEquals("2026-09-18T10:00", row.get("审核时间"));
            assertEquals(0, row.get("修改次数"));
            assertEquals("已核验", row.get("入场核验状态"));
            assertEquals("2026-09-18T11:30", row.get("入场核验时间"));
        }
    }
    @Test void phoneAlreadyUsedByAnotherGroupIsRejected() {
        com.example.app.dto.GuestRequest attendee = new com.example.app.dto.GuestRequest();
        attendee.setPhone("13800000009");
        ApplyRequest request = new ApplyRequest(); request.setAttendees(List.of(attendee));
        when(guests.selectCount(any())).thenReturn(1L);
        BizException error = assertThrows(BizException.class, () -> service.submit(request, companion()));
        assertTrue(error.getMessage().contains("手机号已存在"));
        verify(applications, never()).insert(any(Application.class));
    }

    @Test void duplicateNameAndCompanyRejectedOnSubmit() {
        ApplyRequest request = new ApplyRequest();
        request.setAttendees(List.of(guest(" 张三 ", "甲公司", "13800000009")));
        // 姓名与公司忽略大小写和首尾空格后命中已有登记（主联系人或同行人任一处）即拦截；
        // selectCount 先被手机号占用校验调用（应放行），再被姓名+公司校验调用（命中）
        when(guests.selectCount(any())).thenReturn(0L);
        when(applications.selectCount(any())).thenReturn(0L, 1L);
        BizException error = assertThrows(BizException.class, () -> service.submit(request, companion()));
        assertTrue(error.getMessage().contains("该姓名和公司已有参会登记"));
        verify(applications, never()).insert(any(Application.class));
        verify(guests, never()).insert(any(ApplicationGuest.class));
    }

    @Test void duplicateNameAndCompanyRejectedWithinOneSubmission() {
        ApplyRequest request = new ApplyRequest();
        request.setAttendees(List.of(guest("张三", "甲公司", "13800000008"),
            guest("张三", "甲公司", "13800000009")));
        BizException error = assertThrows(BizException.class, () -> service.submit(request, companion()));
        assertTrue(error.getMessage().contains("该姓名和公司已有参会登记"));
        verify(applications, never()).insert(any(Application.class));
    }

    @Test void resubmitKeepsOwnNameCompanyButRejectsOthers() {
        Application owned = new Application();
        owned.setId(10L); owned.setUserId(2L); owned.setStatus("REJECTED");
        owned.setEditCount(0); owned.setInvitationCode("INVITE"); owned.setPhone("13800000002");
        when(applications.selectOne(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class))).thenReturn(owned);
        when(guests.selectList(any())).thenReturn(List.of(guestRow(10L, 1, "张三", "13800000002")));
        when(applications.resubmit(any(), any(), any(), any(), any(), any(), any(), anyInt(), any())).thenReturn(1);
        Invitation invitation = new Invitation(); invitation.setCode("INVITE"); invitation.setEventCity("上海");
        when(invitationService.getByCode("INVITE")).thenReturn(invitation);
        when(applications.selectById(10L)).thenReturn(owned);

        // 修改登记时保留自己原有的姓名+公司组合：不拦截
        ApplyRequest keep = new ApplyRequest();
        keep.setInvitationCode("INVITE");
        keep.setAttendees(List.of(guest("张三", "甲公司", "13800000002")));
        service.resubmit(keep, companion());
        verify(applications).resubmit(10L, "INVITE", "张三", "13800000002", "甲公司", "", "", 0, "REJECTED");

        // 改成其他登记已占用的姓名+公司：拦截
        ApplyRequest occupied = new ApplyRequest();
        occupied.setInvitationCode("INVITE");
        occupied.setAttendees(List.of(guest("李四", "乙公司", "13800000002")));
        when(guests.selectCount(any())).thenReturn(0L);
        // 第一次 selectCount 属手机号占用校验（放行），第二次属姓名+公司校验（命中）
        when(applications.selectCount(any())).thenReturn(0L, 1L);
        BizException error = assertThrows(BizException.class, () -> service.resubmit(occupied, companion()));
        assertTrue(error.getMessage().contains("该姓名和公司已有参会登记"));
        verify(applications, times(1)).resubmit(any(), any(), any(), any(), any(), any(), any(), anyInt(), any());
    }

    @Test void reviewListFlagsDuplicateAttendeeNames() {
        Application existing = new Application();
        existing.setId(1L); existing.setName("张三"); existing.setStatus("APPROVED");
        Application pending = new Application();
        pending.setId(2L); pending.setName("王五"); pending.setPhone("13800000001"); pending.setStatus("PENDING");
        Page<Application> pageResult = new Page<>(1, 20);
        pageResult.setRecords(List.of(pending));
        when(applications.selectPage(any(), any())).thenReturn(pageResult);
        when(applications.selectList(any())).thenReturn(List.of(existing, pending));
        when(guests.selectList(any())).thenReturn(List.of(
            guestRow(2L, 1, "王五", "13800000001"),
            guestRow(2L, 2, "张三", "13800000003"),
            guestRow(2L, 3, "孙八", "13800000004"),
            guestRow(2L, 4, "孙八", "13800000005")));

        Page<Application> result = service.page(1, 20, null, null, null);
        List<String> duplicates = result.getRecords().get(0).getDuplicateNames();
        assertEquals(2, duplicates.size());
        assertTrue(duplicates.contains("张三"), "与其他登记同名要提醒");
        assertTrue(duplicates.contains("孙八"), "登记内重复姓名要提醒");
        assertFalse(duplicates.contains("王五"), "仅主联系人与自身重复不提醒");
    }

    @Test void lotteryExportUsesCompanionRegistrationAndOwnCompany() {
        ApplicationService lookup = mock(ApplicationService.class);
        InvitationService invitations = mock(InvitationService.class);
        LotteryDrawMapper draws = mock(LotteryDrawMapper.class);
        UserMapper users = mock(UserMapper.class);
        Application group = new Application(); group.setId(10L); group.setUserId(1L);
        group.setInvitationCode("INVITE"); group.setPhone("13800000001"); group.setCompany("主联系人公司");
        ApplicationGuest companion = new ApplicationGuest(); companion.setApplicationId(10L);
        companion.setPhone("13800000002"); companion.setCompany("同行人公司");
        User companionUser = companion(); companionUser.setName("同行人");
        LotteryDraw code = new LotteryDraw(); code.setUserId(2L); code.setLuckyCode("6123");
        Invitation invitation = new Invitation(); invitation.setCode("INVITE"); invitation.setEventCity("济南");
        when(lookup.findAllApplications()).thenReturn(List.of(group));
        when(lookup.findAllGuests()).thenReturn(List.of(companion));
        when(invitations.findAll()).thenReturn(List.of(invitation));
        when(draws.selectList(null)).thenReturn(List.of(code));
        when(users.selectList(null)).thenReturn(List.of(companionUser));
        LotteryService lottery = new LotteryService(lookup, mock(LuckyCodeGeneratorService.class),
                mock(SettingService.class), invitations, draws, users);
        var rows = lottery.exportCodes("济南");
        assertEquals(1, rows.size());
        assertEquals("同行人公司", rows.get(0).get("公司"));
        assertEquals("济南", rows.get(0).get("场次"));
    }
    @Test void companionLotteryUsesOwnAccountAndSharedApproval() {
        linkCompanion("APPROVED");
        LuckyCodeGeneratorService generator = mock(LuckyCodeGeneratorService.class);
        LotteryDraw own = new LotteryDraw(); own.setLuckyCode("1234"); own.setUserId(2L);
        when(generator.getOrCreate(2L, "上海")).thenReturn(own);
        SettingService settings = mock(SettingService.class);
        InvitationService invitations = mock(InvitationService.class);
        Invitation invitation = new Invitation(); invitation.setEventCity("上海");
        when(invitations.getByCode(any())).thenReturn(invitation);
        when(settings.isLotteryOpen("上海")).thenReturn(true);
        LotteryService lottery = new LotteryService(service, generator, settings, invitations, mock(com.example.app.mapper.LotteryDrawMapper.class), mock(com.example.app.mapper.UserMapper.class));
        assertEquals("1234", lottery.get(companion()).getLuckyCode());
        verify(generator).getOrCreate(2L, "上海");
        verify(generator, never()).getOrCreate(1L, "上海");
        linkCompanion("PENDING");
        assertThrows(BizException.class, () -> lottery.get(companion()));
        linkCompanion("REJECTED");
        assertThrows(BizException.class, () -> lottery.get(companion()));
    }
}
