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

    public LuckyCodeResponse get(User user) {
        requireApproved(user);
        LotteryDraw draw = luckyCodeGeneratorService.getOrCreate(user.getId());
        return new LuckyCodeResponse(draw.getLuckyCode(), false);
    }

    /** 兼容旧客户端；号码已在登记时生成，此接口只返回固定号码。 */
    public LuckyCodeResponse draw(User user) {
        return get(user);
    }

    private void requireApproved(User user) {
        Application application = applicationService.findForAttendee(user);
        if (application == null || !"APPROVED".equalsIgnoreCase(application.getStatus())) {
            throw new BizException(ErrorCode.LOTTERY_NOT_APPROVED);
        }
    }
}
