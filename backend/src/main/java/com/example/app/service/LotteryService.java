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

    /** 后台导出抽奖码：抽奖码、姓名、公司、手机号，可按场次过滤。批量查询，避免远程库逐行往返。 */
    public java.util.List<java.util.Map<String, Object>> exportCodes(String city) {
        java.util.List<LotteryDraw> draws = lotteryDrawMapper.selectList(null);
        java.util.List<java.util.Map<String, Object>> rows = new java.util.ArrayList<>();
        if (draws.isEmpty()) return rows;

        java.util.Map<Long, User> userById = new java.util.HashMap<>();
        for (User user : userMapper.selectList(null)) {
            userById.put(user.getId(), user);
        }
        java.util.Map<Long, Application> appByUserId = new java.util.HashMap<>();
        java.util.Map<Long, Application> appById = new java.util.HashMap<>();
        java.util.Map<String, Application> appByPhone = new java.util.HashMap<>();
        java.util.Map<String, String> companyByPhone = new java.util.HashMap<>();
        for (Application application : applicationService.findAllApplications()) {
            if (application.getUserId() != null) appByUserId.put(application.getUserId(), application);
            appById.put(application.getId(), application);
            if (application.getPhone() != null) {
                appByPhone.putIfAbsent(application.getPhone(), application);
                companyByPhone.putIfAbsent(application.getPhone(), application.getCompany());
            }
        }
        for (com.example.app.entity.ApplicationGuest guest : applicationService.findAllGuests()) {
            Application application = appById.get(guest.getApplicationId());
            if (application != null && guest.getPhone() != null) {
                appByPhone.putIfAbsent(guest.getPhone(), application);
                companyByPhone.putIfAbsent(guest.getPhone(), guest.getCompany());
            }
        }
        java.util.Map<String, String> cityByCode = new java.util.HashMap<>();
        for (com.example.app.entity.Invitation invitation : invitationService.findAll()) {
            cityByCode.put(invitation.getCode(), invitation.getEventCity() == null ? "" : invitation.getEventCity());
        }

        for (LotteryDraw draw : draws) {
            User user = userById.get(draw.getUserId());
            if (user == null) continue;
            Application application = appByUserId.get(user.getId());
            if (application == null && user.getPhone() != null && !user.getPhone().isBlank()) {
                application = appByPhone.get(user.getPhone());
            }
            String eventCity = application == null ? "" : cityByCode.getOrDefault(application.getInvitationCode(), "");
            if (city != null && !city.isBlank() && !city.equals(eventCity)) continue;
            String company = user.getPhone() == null ? "" : companyByPhone.getOrDefault(user.getPhone(), "");
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
