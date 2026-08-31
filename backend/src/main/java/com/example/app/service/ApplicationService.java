package com.example.app.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.example.app.common.ApplyStatus;
import com.example.app.common.BizException;
import com.example.app.common.ErrorCode;
import com.example.app.dto.ApplyRequest;
import com.example.app.dto.TicketResponse;
import com.example.app.entity.Application;
import com.example.app.entity.Invitation;
import com.example.app.entity.User;
import com.example.app.mapper.ApplicationMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class ApplicationService {

    private final ApplicationMapper applicationMapper;
    private final InvitationService invitationService;
    private final CheckinTokenService checkinTokenService;
    private final QrCodeService qrCodeService;

    /**
     * 提交申报。事务内完成：
     * 1. 同一登录用户 / 同一手机号幂等拒绝
     * 2. 原子扣减邀请码次数（防并发超卖，失败回滚）
     * 3. 落库（唯一索引兜底）
     */
    @Transactional
    public Application submit(ApplyRequest req, User user) {
        String phone = trimToEmpty(req.getPhone());
        String invitationCode = trimToEmpty(req.getInvitationCode());

        if (getByUserId(user.getId()) != null) {
            throw new BizException(ErrorCode.APPLY_DUPLICATED);
        }

        Long exist = applicationMapper.selectCount(
                new LambdaQueryWrapper<Application>().eq(Application::getPhone, phone));
        if (exist > 0) {
            throw new BizException(ErrorCode.APPLY_DUPLICATED);
        }

        Invitation invitation = invitationService.consume(invitationCode);

        Application application = new Application();
        application.setUserId(user.getId());
        application.setInvitationCode(invitation.getCode());
        application.setName(trimToEmpty(req.getName()));
        application.setPhone(phone);
        application.setCompany(trimToEmpty(req.getCompany()));
        application.setPosition(trimToEmpty(req.getPosition()));
        application.setReason(trimToEmpty(req.getReason()));
        application.setStatus(ApplyStatus.PENDING.name());
        try {
            applicationMapper.insert(application);
        } catch (DuplicateKeyException e) {
            throw new BizException(ErrorCode.APPLY_DUPLICATED);
        }
        return application;
    }

    /** 分页查询，status 为空查全部 */
    public Page<Application> page(long page, long size, String status) {
        LambdaQueryWrapper<Application> wrapper = new LambdaQueryWrapper<Application>()
                .eq(status != null && !status.isBlank(), Application::getStatus, status)
                .orderByDesc(Application::getId);
        return applicationMapper.selectPage(Page.of(page, size), wrapper);
    }

    public Map<ApplyStatus, Long> countByStatus() {
        Map<ApplyStatus, Long> stats = new EnumMap<>(ApplyStatus.class);
        for (ApplyStatus s : ApplyStatus.values()) {
            stats.put(s, 0L);
        }
        List<Map<String, Object>> rows = applicationMapper.countGroupByStatus();
        for (Map<String, Object> row : rows) {
            Object statusVal = row.get("status");
            Object cntVal = row.get("cnt");
            if (statusVal == null || cntVal == null) {
                continue;
            }
            try {
                ApplyStatus status = ApplyStatus.valueOf(String.valueOf(statusVal).trim().toUpperCase());
                stats.put(status, ((Number) cntVal).longValue());
            } catch (IllegalArgumentException ignored) {
                // 忽略历史脏状态
            }
        }
        return stats;
    }

    public Application getByUserId(Long userId) {
        if (userId == null) {
            return null;
        }
        return applicationMapper.selectOne(
                new LambdaQueryWrapper<Application>().eq(Application::getUserId, userId)
                        .orderByDesc(Application::getId)
                        .last("LIMIT 1"));
    }

    public TicketResponse issueTicket(User user) {
        Application application = getByUserId(user.getId());
        if (application == null) {
            throw new BizException(ErrorCode.APPLY_NOT_FOUND);
        }
        String ticketNo = "BOCHU-" + lastFour(application.getPhone());
        boolean approved = ApplyStatus.APPROVED.name().equals(application.getStatus());
        boolean checkedIn = application.getCheckedInAt() != null;
        TicketResponse.TicketResponseBuilder builder = TicketResponse.builder()
                .applicationId(application.getId())
                .status(application.getStatus())
                .name(application.getName())
                .phone(application.getPhone())
                .ticketNo(ticketNo)
                .checkedIn(checkedIn)
                .expireSeconds((int) checkinTokenService.ttl().toSeconds());
        if (approved && !checkedIn) {
            String token = checkinTokenService.issue(application.getId());
            builder.token(token).qrBase64(qrCodeService.pngBase64(token));
        }
        return builder.build();
    }

    @Transactional
    public Application checkIn(String token) {
        long id = checkinTokenService.parse(token);
        Application current = applicationMapper.selectById(id);
        if (current == null) {
            throw new BizException(ErrorCode.APPLY_NOT_FOUND);
        }
        if (!ApplyStatus.APPROVED.name().equals(current.getStatus())) {
            throw new BizException(ErrorCode.CHECKIN_NOT_APPROVED);
        }
        if (current.getCheckedInAt() != null) {
            throw new BizException(ErrorCode.CHECKIN_ALREADY);
        }
        int updated = applicationMapper.checkInIfApproved(id);
        if (updated == 0) {
            throw new BizException(ErrorCode.CHECKIN_ALREADY);
        }
        return applicationMapper.selectById(id);
    }

    /**
     * 审核：条件更新保证 PENDING 单向流转，
     * 并发重复审核 / 已终态时返回冲突错误。
     */
    @Transactional
    public Application review(Long id, ApplyStatus target, String remark) {
        if (target == null || target == ApplyStatus.PENDING) {
            throw new BizException(ErrorCode.BAD_REQUEST, "目标状态不能是 PENDING");
        }
        Application current = applicationMapper.selectById(id);
        if (current == null) {
            throw new BizException(ErrorCode.APPLY_NOT_FOUND);
        }
        if (isFinalStatus(current.getStatus())) {
            throw new BizException(ErrorCode.APPLY_ALREADY_REVIEWED);
        }
        int updated = applicationMapper.reviewIfPending(id, target.name(), trimToNull(remark));
        if (updated == 0) {
            throw new BizException(ErrorCode.APPLY_ALREADY_REVIEWED);
        }
        return applicationMapper.selectById(id);
    }

    private static boolean isFinalStatus(String status) {
        if (status == null || status.isBlank()) {
            return false;
        }
        try {
            return ApplyStatus.valueOf(status.trim().toUpperCase()).isFinal();
        } catch (IllegalArgumentException e) {
            return true;
        }
    }

    private static String lastFour(String phone) {
        if (phone == null || phone.length() < 4) {
            return "0000";
        }
        return phone.substring(phone.length() - 4);
    }

    private static String trimToEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
