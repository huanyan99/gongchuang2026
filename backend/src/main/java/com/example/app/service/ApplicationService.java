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
import com.example.app.mapper.ApplicationGuestMapper;
import com.example.app.entity.ApplicationGuest;
import com.example.app.dto.GuestRequest;
import java.time.LocalDate;
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
    private final com.example.app.mapper.InvitationMapper invitationMapper;
    private final CheckinTokenService checkinTokenService;
    private final QrCodeService qrCodeService;
    private final ApplicationGuestMapper applicationGuestMapper;
    private final LuckyCodeGeneratorService luckyCodeGeneratorService;

    /**
     * 提交申报。事务内完成：
     * 1. 同一登录用户 / 同一手机号幂等拒绝
     * 2. 原子扣减邀请码次数（防并发超卖，失败回滚）
     * 3. 落库（唯一索引兜底）
     */
    @Transactional
    public Application submit(ApplyRequest req, User user) {
        List<GuestRequest> guests = req.getAttendees();
        if (guests == null || guests.isEmpty() || guests.size() > 10 ||
                (req.getAttendeeCount() != null && req.getAttendeeCount() != guests.size())) {
            throw new BizException(ErrorCode.BAD_REQUEST, "同行人员信息不完整");
        }
        GuestRequest primary = guests.get(0);
        String phone = trimToEmpty(primary.getPhone());
        String invitationCode = trimToEmpty(req.getInvitationCode());

        if (getByUser(user) != null) {
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
        application.setName(trimToEmpty(primary.getName()));
        application.setPhone(phone);
        application.setCompany(trimToEmpty(primary.getCompany()));
        application.setPosition(trimToEmpty(primary.getPosition()));
        application.setReason(trimToEmpty(req.getReason()));
        application.setStatus(ApplyStatus.PENDING.name());
        try {
            applicationMapper.insert(application);
            for (int i = 0; i < guests.size(); i++) {
                GuestRequest guest = guests.get(i);
                ApplicationGuest row = new ApplicationGuest();
                row.setApplicationId(application.getId()); row.setGuestIndex(i + 1);
                row.setName(trimToEmpty(guest.getName())); row.setCompany(trimToEmpty(guest.getCompany()));
                row.setGender(guest.getGender()); row.setPhone(trimToEmpty(guest.getPhone()));
                row.setPosition(trimToEmpty(guest.getPosition())); row.setAccommodation(guest.getAccommodation());
                row.setRoomType(guest.getRoomType()); row.setCheckinDate(LocalDate.parse(guest.getCheckinDate()));
                applicationGuestMapper.insert(row);
            }
            // 号码随登记事务一起生成；后续抽奖页只读取并播放展示动画。
            luckyCodeGeneratorService.getOrCreate(user.getId());
            application.setAttendees(loadGuests(application.getId()));
        } catch (DuplicateKeyException e) {
            throw new BizException(ErrorCode.APPLY_DUPLICATED);
        }
        return application;
    }

    /** 嘉宾最多修改两次；修改后重置为待审核并替换全部同行人员信息。 */
    @Transactional
    public Application resubmit(ApplyRequest req, User user) {
        Application current = getByUser(user);
        if (current == null) throw new BizException(ErrorCode.APPLY_NOT_FOUND);
        int editCount = current.getEditCount() == null ? 0 : current.getEditCount();
        if (editCount >= 2) throw new BizException(ErrorCode.CONFLICT, "登记信息最多修改两次");
        List<GuestRequest> guests = req.getAttendees();
        if (guests == null || guests.isEmpty() || guests.size() > 10 ||
                (req.getAttendeeCount() != null && req.getAttendeeCount() != guests.size())) {
            throw new BizException(ErrorCode.BAD_REQUEST, "同行人员信息不完整");
        }
        GuestRequest primary = guests.get(0);
        String phone = trimToEmpty(primary.getPhone());
        String requestedInvitationCode = trimToEmpty(req.getInvitationCode()).toUpperCase();
        String currentInvitationCode = trimToEmpty(current.getInvitationCode()).toUpperCase();
        String effectiveInvitationCode = currentInvitationCode;
        if (!requestedInvitationCode.equals(currentInvitationCode)) {
            if (!ApplyStatus.REJECTED.name().equals(current.getStatus())) {
                throw new BizException(ErrorCode.CONFLICT, "当前审核状态不允许切换受邀场次");
            }
            Invitation replacement = invitationService.consume(requestedInvitationCode);
            Invitation previous = invitationService.getByCode(currentInvitationCode);
            invitationMapper.releaseUse(previous.getId());
            effectiveInvitationCode = replacement.getCode();
        }
        Long duplicate = applicationMapper.selectCount(new LambdaQueryWrapper<Application>()
                .eq(Application::getPhone, phone).ne(Application::getId, current.getId()));
        if (duplicate > 0) throw new BizException(ErrorCode.APPLY_DUPLICATED);
        int updated = applicationMapper.resubmit(current.getId(), effectiveInvitationCode,
                trimToEmpty(primary.getName()), phone,
                trimToEmpty(primary.getCompany()), trimToEmpty(primary.getPosition()), trimToEmpty(req.getReason()));
        if (updated == 0) throw new BizException(ErrorCode.CONFLICT, "登记信息最多修改两次");
        applicationGuestMapper.delete(new LambdaQueryWrapper<ApplicationGuest>()
                .eq(ApplicationGuest::getApplicationId, current.getId()));
        insertGuests(current.getId(), guests);
        luckyCodeGeneratorService.getOrCreate(user.getId());
        Application result = applicationMapper.selectById(current.getId());
        result.setAttendees(loadGuests(result.getId()));
        return result;
    }

    private void insertGuests(Long applicationId, List<GuestRequest> guests) {
        for (int i = 0; i < guests.size(); i++) {
            GuestRequest guest = guests.get(i);
            ApplicationGuest row = new ApplicationGuest();
            row.setApplicationId(applicationId); row.setGuestIndex(i + 1);
            row.setName(trimToEmpty(guest.getName())); row.setCompany(trimToEmpty(guest.getCompany()));
            row.setGender(guest.getGender()); row.setPhone(trimToEmpty(guest.getPhone()));
            row.setPosition(trimToEmpty(guest.getPosition())); row.setAccommodation(guest.getAccommodation());
            row.setRoomType(guest.getRoomType()); row.setCheckinDate(LocalDate.parse(guest.getCheckinDate()));
            applicationGuestMapper.insert(row);
        }
    }

    public List<ApplicationGuest> loadGuests(Long applicationId) {
        return applicationGuestMapper.selectList(new LambdaQueryWrapper<ApplicationGuest>()
                .eq(ApplicationGuest::getApplicationId, applicationId).orderByAsc(ApplicationGuest::getGuestIndex));
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

    /**
     * 按登录用户查参会登记：先按 user_id，查不到且用户带手机号时按手机号回退匹配。
     * 网页版手机号登录是新建身份，手机号回退让老登记记录（小程序/其他渠道提交）同样可见。
     */
    public Application getByUser(User user) {
        if (user == null) {
            return null;
        }
        Application application = getByUserId(user.getId());
        if (application == null && user.getPhone() != null && !user.getPhone().isBlank()) {
            application = applicationMapper.selectOne(
                    new LambdaQueryWrapper<Application>().eq(Application::getPhone, user.getPhone())
                            .orderByDesc(Application::getId)
                            .last("LIMIT 1"));
        }
        return application;
    }

    /**
     * 抽奖码、桌位等「按嘉宾身份」查询：user_id → 主要联系人手机号 → 同行人手机号。
     * 同行人各自用手机号登录后没有独立登记记录，只能靠 guest 表反查所属登记。
     * 只用于只读查询，修改登记仍走 getByUser，避免同行人改到别人的登记。
     */
    public Application findForAttendee(User user) {
        Application application = getByUser(user);
        if (application != null) return application;
        String phone = user == null || user.getPhone() == null ? "" : user.getPhone().trim();
        if (phone.isEmpty()) return null;

        List<ApplicationGuest> guests = applicationGuestMapper.selectList(
                new LambdaQueryWrapper<ApplicationGuest>()
                        .eq(ApplicationGuest::getPhone, phone)
                        .orderByDesc(ApplicationGuest::getId));
        Application fallback = null;
        for (ApplicationGuest guest : guests) {
            Application candidate = applicationMapper.selectById(guest.getApplicationId());
            if (candidate == null) continue;
            if (ApplyStatus.APPROVED.name().equals(candidate.getStatus())) return candidate;
            if (fallback == null) fallback = candidate;
        }
        return fallback;
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
        Application application = getByUser(user);
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
