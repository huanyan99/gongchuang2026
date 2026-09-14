package com.example.app.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.example.app.entity.LotteryDraw;
import com.example.app.mapper.LotteryDrawMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;

/** 只负责创建并固定用户的四位抽奖码，可在登记事务和历史数据补全中复用。 */
@Service
@RequiredArgsConstructor
public class LuckyCodeGeneratorService {
    private final LotteryDrawMapper lotteryDrawMapper;
    private final SecureRandom random = new SecureRandom();

    public LotteryDraw getOrCreate(Long userId) {
        LotteryDraw existing = find(userId);
        if (existing != null) return existing;
        LotteryDraw draw = new LotteryDraw();
        draw.setUserId(userId);
        draw.setLuckyCode(String.format("%04d", random.nextInt(10000)));
        try {
            lotteryDrawMapper.insert(draw);
            return draw;
        } catch (DuplicateKeyException e) {
            LotteryDraw concurrent = find(userId);
            if (concurrent == null) throw e;
            return concurrent;
        }
    }

    private LotteryDraw find(Long userId) {
        return lotteryDrawMapper.selectOne(new LambdaQueryWrapper<LotteryDraw>()
                .eq(LotteryDraw::getUserId, userId).last("LIMIT 1"));
    }
}
