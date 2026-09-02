package com.example.app.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.example.app.common.BizException;
import com.example.app.common.ErrorCode;
import com.example.app.dto.LuckyCodeResponse;
import com.example.app.entity.LotteryDraw;
import com.example.app.entity.Application;
import com.example.app.mapper.ApplicationMapper;
import com.example.app.mapper.LotteryDrawMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;

@Service
@RequiredArgsConstructor
public class LotteryService {
    private final LotteryDrawMapper lotteryDrawMapper;
    private final ApplicationMapper applicationMapper;
    private final SecureRandom random = new SecureRandom();

    public LuckyCodeResponse get(Long userId) {
        requireApproved(userId);
        LotteryDraw draw = findByUserId(userId);
        if (draw == null) {
            throw new BizException(ErrorCode.LOTTERY_NOT_DRAWN);
        }
        return new LuckyCodeResponse(draw.getLuckyCode(), false);
    }

    @Transactional
    public LuckyCodeResponse draw(Long userId) {
        requireApproved(userId);
        LotteryDraw existing = findByUserId(userId);
        if (existing != null) {
            return new LuckyCodeResponse(existing.getLuckyCode(), false);
        }
        LotteryDraw draw = new LotteryDraw();
        draw.setUserId(userId);
        draw.setLuckyCode(String.format("%04d", random.nextInt(10000)));
        try {
            lotteryDrawMapper.insert(draw);
            return new LuckyCodeResponse(draw.getLuckyCode(), true);
        } catch (DuplicateKeyException e) {
            LotteryDraw concurrent = findByUserId(userId);
            if (concurrent == null) throw e;
            return new LuckyCodeResponse(concurrent.getLuckyCode(), false);
        }
    }

    private LotteryDraw findByUserId(Long userId) {
        return lotteryDrawMapper.selectOne(new LambdaQueryWrapper<LotteryDraw>()
                .eq(LotteryDraw::getUserId, userId)
                .last("LIMIT 1"));
    }

    private void requireApproved(Long userId) {
        Application application = applicationMapper.selectOne(new LambdaQueryWrapper<Application>()
                .eq(Application::getUserId, userId)
                .orderByDesc(Application::getId)
                .last("LIMIT 1"));
        if (application == null || !"APPROVED".equalsIgnoreCase(application.getStatus())) {
            throw new BizException(ErrorCode.LOTTERY_NOT_APPROVED);
        }
    }
}
