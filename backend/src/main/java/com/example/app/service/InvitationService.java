package com.example.app.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.example.app.common.BizException;
import com.example.app.common.ErrorCode;
import com.example.app.entity.Invitation;
import com.example.app.mapper.InvitationMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;

@Service
@RequiredArgsConstructor
public class InvitationService {

    /** 无易混淆字符的字母表（去掉 0/O/1/I） */
    private static final char[] ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ".toCharArray();
    private static final int CODE_LENGTH = 8;
    private static final int MAX_CREATE_RETRY = 5;

    private final SecureRandom random = new SecureRandom();
    private final InvitationMapper invitationMapper;

    /**
     * 原子扣减一次使用名额。返回被扣减的邀请码实体；
     * 名额被并发抢完时抛 INVITATION_EXHAUSTED，事务回滚。
     */
    public Invitation consume(String code) {
        Invitation invitation = getByCode(code);
        if (invitationMapper.consumeUse(invitation.getId()) == 0) {
            throw new BizException(ErrorCode.INVITATION_EXHAUSTED);
        }
        return invitation;
    }

    /**
     * 校验邀请码可用性。只读操作，不扣减次数；
     * 真正扣减在提交申报时原子完成。
     */
    public void checkUsable(String code) {
        Invitation invitation = getByCode(code);
        int used = invitation.getUsedCount() == null ? 0 : invitation.getUsedCount();
        int max = invitation.getMaxUses() == null ? 0 : invitation.getMaxUses();
        if (used >= max) {
            throw new BizException(ErrorCode.INVITATION_EXHAUSTED);
        }
    }

    public Invitation getByCode(String code) {
        if (code == null || code.isBlank()) {
            throw new BizException(ErrorCode.INVITATION_NOT_FOUND);
        }
        Invitation invitation = invitationMapper.selectOne(
                new LambdaQueryWrapper<Invitation>().eq(Invitation::getCode, normalizeCode(code)));
        if (invitation == null) {
            throw new BizException(ErrorCode.INVITATION_NOT_FOUND);
        }
        return invitation;
    }

    /** 生成邀请码；极小概率撞码时重试，由唯一索引兜底 */
    public Invitation create(int maxUses) {
        if (maxUses < 1 || maxUses > 100000) {
            throw new BizException(ErrorCode.BAD_REQUEST, "maxUses 需在 1~100000 之间");
        }
        for (int i = 0; i < MAX_CREATE_RETRY; i++) {
            Invitation invitation = new Invitation();
            invitation.setCode(randomCode());
            invitation.setMaxUses(maxUses);
            invitation.setUsedCount(0);
            try {
                invitationMapper.insert(invitation);
                return invitation;
            } catch (DuplicateKeyException e) {
                // 撞码，重试
            }
        }
        throw new BizException(ErrorCode.INTERNAL_ERROR, "邀请码生成失败，请重试");
    }

    private String randomCode() {
        StringBuilder sb = new StringBuilder(CODE_LENGTH);
        for (int i = 0; i < CODE_LENGTH; i++) {
            sb.append(ALPHABET[random.nextInt(ALPHABET.length)]);
        }
        return sb.toString();
    }

    private static String normalizeCode(String code) {
        return code.trim().toUpperCase();
    }
}
