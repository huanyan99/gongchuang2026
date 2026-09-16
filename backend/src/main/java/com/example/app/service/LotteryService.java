package com.example.app.service;

import com.example.app.common.BizException;
import com.example.app.common.ErrorCode;
import com.example.app.dto.LuckyCodeResponse;
import com.example.app.entity.LotteryDraw;
import com.example.app.entity.Application;
import com.example.app.entity.User;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class LotteryService {
    private final ApplicationService applicationService;
    private final LuckyCodeGeneratorService luckyCodeGeneratorService;
    private final SettingService settingService;
    private final InvitationService invitationService;
    private final com.example.app.mapper.LotteryDrawMapper lotteryDrawMapper;
    private final com.example.app.mapper.UserMapper userMapper;

    public LuckyCodeResponse get(User user) {
        Application application = requireApproved(user);
        String eventCity = invitationService.getByCode(application.getInvitationCode()).getEventCity();
        LotteryDraw draw = luckyCodeGeneratorService.getOrCreate(user.getId(), eventCity);
        return new LuckyCodeResponse(draw.getLuckyCode(), false);
    }

    /** 兼容旧客户端；号码已在登记时生成，此接口只返回固定号码。 */
    public LuckyCodeResponse draw(User user) {
        return get(user);
    }

    private Application requireApproved(User user) {
        Application application = applicationService.findForAttendee(user);
        if (application == null || !"APPROVED".equalsIgnoreCase(application.getStatus())) {
            throw new BizException(ErrorCode.LOTTERY_NOT_APPROVED);
        }
        String city = invitationService.getByCode(application.getInvitationCode()).getEventCity();
        if (!settingService.isLotteryOpen(city)) {
            throw new BizException(ErrorCode.LOTTERY_NOT_OPEN);
        }
        return application;
    }

    /** 后台导出抽奖码：抽奖码、姓名、公司、手机号，可按场次过滤 */
    public java.util.List<java.util.Map<String, Object>> exportCodes(String city) {
        java.util.List<LotteryDraw> draws = lotteryDrawMapper.selectList(null);
        java.util.List<java.util.Map<String, Object>> rows = new java.util.ArrayList<>();
        for (LotteryDraw draw : draws) {
            User user = userMapper.selectById(draw.getUserId());
            if (user == null) continue;
            Application application = applicationService.findForAttendee(user);
            String eventCity = "";
            String company = "";
            if (application != null) {
                try {
                    eventCity = invitationService.getByCode(application.getInvitationCode()).getEventCity();
                } catch (Exception ignored) {
                }
                company = application.getCompany() == null ? "" : application.getCompany();
            }
            if (city != null && !city.isBlank() && !city.equals(eventCity)) continue;
            java.util.Map<String, Object> row = new java.util.LinkedHashMap<>();
            row.put("抽奖码", draw.getLuckyCode());
            row.put("姓名", user.getName() == null ? "" : user.getName());
            row.put("手机号", user.getPhone() == null ? "" : user.getPhone());
            row.put("公司", company);
            row.put("场次", eventCity);
            rows.add(row);
        }
        return rows;
    }
}