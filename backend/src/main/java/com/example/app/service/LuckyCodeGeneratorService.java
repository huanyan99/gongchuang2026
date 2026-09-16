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
import java.util.Map;

/**
 * 只负责创建并固定用户的四位抽奖码，可在登记事务和历史数据补全中复用。
 *
 * 号码规则：场次前缀 + 后三位。佛山=1xxx，济南=6xxx，上海=8xxx；
 * 后三位在 0/1/2/3/5/6/7/8/9 中取值（规避数字 4），每场可用 9×9×9 = 729 个。
 * 数据库 unique(lucky_code) 兜底防止多用户、多个后端实例同时领取同一号码。
 */
@Service
@RequiredArgsConstructor
public class LuckyCodeGeneratorService {
    private final LotteryDrawMapper lotteryDrawMapper;
    private final SecureRandom random = new SecureRandom();

    private static final Map<String, String> CITY_PREFIX = Map.of("佛山", "1", "济南", "6", "上海", "8");
    private static final String SUFFIX_DIGITS = "012356789";
    private static final int SUFFIX_SPACE = SUFFIX_DIGITS.length()
            * SUFFIX_DIGITS.length() * SUFFIX_DIGITS.length();

    public LotteryDraw getOrCreate(Long userId, String eventCity) {
        LotteryDraw existing = find(userId);
        if (existing != null) return existing;

        String prefix = CITY_PREFIX.getOrDefault(eventCity == null ? "" : eventCity.trim(), "1");
        int start = random.nextInt(SUFFIX_SPACE);
        for (int offset = 0; offset < SUFFIX_SPACE; offset++) {
            int value = (start + offset) % SUFFIX_SPACE;
            StringBuilder suffix = new StringBuilder();
            for (int i = 0; i < 3; i++) {
                suffix.append(SUFFIX_DIGITS.charAt(value % SUFFIX_DIGITS.length()));
                value /= SUFFIX_DIGITS.length();
            }
            LotteryDraw draw = new LotteryDraw();
            draw.setUserId(userId);
            draw.setLuckyCode(prefix + suffix);
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
        throw new BizException(ErrorCode.CONFLICT, "该场次抽奖号码已用尽，请联系会务人员");
    }

    private LotteryDraw find(Long userId) {
        return lotteryDrawMapper.selectOne(new LambdaQueryWrapper<LotteryDraw>()
                .eq(LotteryDraw::getUserId, userId).last("LIMIT 1"));
    }
}
