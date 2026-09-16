package com.example.app.service;

import com.example.app.common.BizException;
import com.example.app.entity.*;
import com.example.app.mapper.SettingMapper;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class LotterySwitchTest {
    @Test void defaultsClosedAndCitiesAreIndependent() {
        SettingMapper mapper = mock(SettingMapper.class);
        SettingService settings = new SettingService(mapper);
        for (String city : SettingService.LOTTERY_KEYS.keySet()) assertFalse(settings.isLotteryOpen(city));
        Setting enabled = new Setting(); enabled.setSettingValue("true");
        when(mapper.selectById("lottery_open_jinan")).thenReturn(enabled);
        assertTrue(settings.isLotteryOpen("济南"));
        assertFalse(settings.isLotteryOpen("上海"));
        assertFalse(settings.isLotteryOpen("佛山"));
        assertFalse(settings.isLotteryOpen(null));
        assertFalse(settings.isLotteryOpen("未知场次"));
    }

    @Test void closingBlocksBothEndpointsWithoutChangingNumber() {
        ApplicationService applications = mock(ApplicationService.class);
        LuckyCodeGeneratorService generator = mock(LuckyCodeGeneratorService.class);
        SettingService settings = mock(SettingService.class);
        InvitationService invitations = mock(InvitationService.class);
        User user = new User(); user.setId(9L);
        Application record = new Application(); record.setStatus("APPROVED"); record.setInvitationCode("SH");
        when(applications.findForAttendee(user)).thenReturn(record);
        Invitation invitation = new Invitation(); invitation.setEventCity("上海");
        when(invitations.getByCode("SH")).thenReturn(invitation);
        LotteryService lottery = new LotteryService(applications, generator, settings, invitations, mock(com.example.app.mapper.LotteryDrawMapper.class), mock(com.example.app.mapper.UserMapper.class));
        assertEquals("还没有到时间",assertThrows(BizException.class,()->lottery.get(user)).getMessage());
        assertThrows(BizException.class,()->lottery.draw(user));
        verifyNoInteractions(generator);
        LotteryDraw draw = new LotteryDraw(); draw.setLuckyCode("5458");
        when(generator.getOrCreate(9L, "上海")).thenReturn(draw);
        when(settings.isLotteryOpen("上海")).thenReturn(true);
        assertEquals("5458",lottery.get(user).getLuckyCode());
        when(settings.isLotteryOpen("上海")).thenReturn(false);
        assertThrows(BizException.class,()->lottery.get(user));
        verify(generator,times(1)).getOrCreate(9L, "上海");
    }
}
