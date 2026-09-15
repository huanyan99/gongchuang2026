package com.example.app.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.example.app.entity.LotteryDraw;
import com.example.app.mapper.LotteryDrawMapper;
import com.example.app.common.BizException;
import com.example.app.common.ErrorCode;
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
        // 数据库 unique(lucky_code) 防止多用户、多个后端实例同时领取同一号码。
        // 随机起点后遍历全空间，避免接近用尽时随机重试遗漏剩余号码。
        int start = random.nextInt(10000);
        for (int offset = 0; offset < 10000; offset++) {
            LotteryDraw draw = new LotteryDraw();
            draw.setUserId(userId);
            draw.setLuckyCode(String.format(java.util.Locale.ROOT, "%04d", (start + offset) % 10000));
            try {
                lotteryDrawMapper.insert(draw);
                return draw;
            } catch (DuplicateKeyException e) {
                // 当前读可看到其他事务刚为同一用户生成的号码。
                LotteryDraw concurrent = lotteryDrawMapper.selectOne(new LambdaQueryWrapper<LotteryDraw>()
                        .eq(LotteryDraw::getUserId, userId).last("LIMIT 1 FOR UPDATE"));
                if (concurrent != null) return concurrent;
            }
        }
        throw new BizException(ErrorCode.CONFLICT, "抽奖号码已用尽，请联系会务人员");
    }

    private LotteryDraw find(Long userId) {
        return lotteryDrawMapper.selectOne(new LambdaQueryWrapper<LotteryDraw>()
                .eq(LotteryDraw::getUserId, userId).last("LIMIT 1"));
    }
}
