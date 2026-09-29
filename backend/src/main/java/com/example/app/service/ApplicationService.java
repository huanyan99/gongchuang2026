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
import com.example.app.entity.RegistrationIdentity;
import com.example.app.dto.GuestRequest;
import java.time.LocalDate;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Set;
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
    private final com.example.app.mapper.SeatMapper seatMapper;
    private final com.example.app.mapper.RegistrationIdentityMapper registrationIdentityMapper;

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
        validateDistinctPhones(guests);
        validatePhonesAvailable(guests, null);
        Set<String> identityKeys = validateIdentities(guests, null, Map.of());
        GuestRequest primary = guests.get(0);
        String phone = trimToEmpty(primary.getPhone());
        String invitationCode = trimToEmpty(req.getInvitationCode());

        if (findForAttendee(user) != null) {
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
            reserveIdentities(identityKeys, application.getId());
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
            luckyCodeGeneratorService.getOrCreate(user.getId(), invitation.getEventCity());
            application.setAttendees(loadGuests(application.getId()));
        } catch (DuplicateKeyException e) {
            throw new BizException(ErrorCode.APPLY_DUPLICATED);
        }
        return application;
    }

    /** 嘉宾最多修改两次；修改后重置为待审核并替换全部同行人员信息。 */
    @Transactional
    public Application resubmit(ApplyRequest req, User user) {
        Application current = findForAttendee(user);
        if (current == null) throw new BizException(ErrorCode.APPLY_NOT_FOUND);
        if (!java.util.Objects.equals(current.getUserId(), user.getId())) {
            throw new BizException(ErrorCode.UNAUTHORIZED, "仅登记提交人可修改同行登记信息");
        }
        int editCount = current.getEditCount() == null ? 0 : current.getEditCount();
        if (editCount >= 2) throw new BizException(ErrorCode.CONFLICT, "登记信息最多修改两次");
        List<GuestRequest> guests = req.getAttendees();
        if (guests == null || guests.isEmpty() || guests.size() > 10 ||
                (req.getAttendeeCount() != null && req.getAttendeeCount() != guests.size())) {
            throw new BizException(ErrorCode.BAD_REQUEST, "同行人员信息不完整");
        }
        validateDistinctPhones(guests);
        validatePhonesAvailable(guests, current.getId());
        Map<String, Integer> oldIdentityCounts = identityCounts(loadGuests(current.getId()));
        Set<String> identityKeys = validateIdentities(guests, current.getId(), oldIdentityCounts);
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
        int updated = applicationMapper.resubmit(current.getId(), effectiveInvitationCode,
                trimToEmpty(primary.getName()), phone,
                trimToEmpty(primary.getCompany()), trimToEmpty(primary.getPosition()), trimToEmpty(req.getReason()),
                editCount, current.getStatus());
        if (updated == 0) {
            throw new BizException(ErrorCode.CONFLICT, "登记状态已变化（可能刚被审核），请刷新后确认再修改");
        }
        applicationGuestMapper.delete(new LambdaQueryWrapper<ApplicationGuest>()
                .eq(ApplicationGuest::getApplicationId, current.getId()));
        insertGuests(current.getId(), guests);
        Set<String> removedKeys = new HashSet<>(oldIdentityCounts.keySet());
        removedKeys.removeAll(identityKeys);
        if (!removedKeys.isEmpty()) {
            registrationIdentityMapper.delete(new LambdaQueryWrapper<RegistrationIdentity>()
                    .eq(RegistrationIdentity::getApplicationId, current.getId())
                    .in(RegistrationIdentity::getIdentityKey, removedKeys));
        }
        Set<String> addedKeys = new HashSet<>(identityKeys);
        addedKeys.removeAll(oldIdentityCounts.keySet());
        reserveIdentities(addedKeys, current.getId());
        String effectiveCity = invitationService.getByCode(effectiveInvitationCode).getEventCity();
        luckyCodeGeneratorService.alignToCity(user.getId(), effectiveCity);
        Application result = applicationMapper.selectById(current.getId());
        result.setAttendees(loadGuests(result.getId()));
        return result;
    }

    private void validateDistinctPhones(List<GuestRequest> guests) {
        Map<String, Integer> seen = new java.util.HashMap<>();
        for (int i = 0; i < guests.size(); i++) {
            String phone = trimToEmpty(guests.get(i).getPhone());
            Integer previous = seen.putIfAbsent(phone, i + 1);
            if (previous != null) {
                throw new BizException(ErrorCode.BAD_REQUEST,
                        "第" + (i + 1) + "位与第" + previous + "位手机号重复，请填写各自的手机号");
            }
        }
    }

    /** 手机号代表唯一参会人，不能出现在其他登记单的主联系人或同行人中。 */
    private void validatePhonesAvailable(List<GuestRequest> guests, Long excludedApplicationId) {
        List<String> phones = guests.stream().map(GuestRequest::getPhone)
                .map(ApplicationService::trimToEmpty).toList();
        LambdaQueryWrapper<Application> applications = new LambdaQueryWrapper<Application>()
                .in(Application::getPhone, phones)
                .ne(excludedApplicationId != null, Application::getId, excludedApplicationId);
        LambdaQueryWrapper<ApplicationGuest> attendeeRows = new LambdaQueryWrapper<ApplicationGuest>()
                .in(ApplicationGuest::getPhone, phones)
                .ne(excludedApplicationId != null, ApplicationGuest::getApplicationId, excludedApplicationId);
        Long applicationMatches = applicationMapper.selectCount(applications);
        Long guestMatches = applicationGuestMapper.selectCount(attendeeRows);
        if ((applicationMatches != null && applicationMatches > 0)
                || (guestMatches != null && guestMatches > 0)) {
            throw new BizException(ErrorCode.APPLY_DUPLICATED, "手机号已存在于其他参会登记中");
        }
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

    /** 分页查询，关键词可匹配主联系人/同行人的姓名或手机号，场次通过邀请码归属筛选。 */
    public Page<Application> page(long page, long size, String status, String city, String name) {
        LambdaQueryWrapper<Application> wrapper = new LambdaQueryWrapper<Application>()
                .eq(status != null && !status.isBlank(), Application::getStatus, status)
                .orderByDesc(Application::getId);
        if (name != null && !name.isBlank()) {
            String pattern = name.trim().replace("!", "!!").replace("%", "!%").replace("_", "!_");
            wrapper.and(match -> match
                    .apply("gonghcuang_application.name LIKE CONCAT('%', {0}, '%') ESCAPE '!'", pattern)
                    .or()
                    .apply("gonghcuang_application.phone LIKE CONCAT('%', {0}, '%') ESCAPE '!'", pattern)
                    .or()
                    .apply("EXISTS (SELECT 1 FROM gonghcuang_application_guest g WHERE g.application_id = gonghcuang_application.id AND (g.name LIKE CONCAT('%', {0}, '%') ESCAPE '!' OR g.phone LIKE CONCAT('%', {0}, '%') ESCAPE '!'))", pattern));
        }
        if (city != null && !city.isBlank()) {
            List<String> codes = invitationMapper.selectList(
                            new LambdaQueryWrapper<Invitation>().eq(Invitation::getEventCity, city.trim()))
                    .stream().map(Invitation::getCode).toList();
            if (codes.isEmpty()) return new Page<>(page, size);
            wrapper.in(Application::getInvitationCode, codes);
        }
        Page<Application> result = applicationMapper.selectPage(Page.of(page, size), wrapper);
        if (!result.getRecords().isEmpty()) {
            List<Long> ids = result.getRecords().stream().map(Application::getId).toList();
            Map<Long, List<ApplicationGuest>> guestsByApplication = new HashMap<>();
            for (ApplicationGuest guest : applicationGuestMapper.selectList(
                    new LambdaQueryWrapper<ApplicationGuest>()
                            .in(ApplicationGuest::getApplicationId, ids)
                            .orderByAsc(ApplicationGuest::getApplicationId)
                            .orderByAsc(ApplicationGuest::getGuestIndex))) {
                guestsByApplication.computeIfAbsent(guest.getApplicationId(), ignored -> new ArrayList<>()).add(guest);
            }
            for (Application application : result.getRecords()) {
                application.setAttendees(guestsByApplication.getOrDefault(application.getId(), List.of()));
            }
            annotateDuplicateNames(result.getRecords(), guestsByApplication);
        }
        return result;
    }

    /**
     * 审核列表同名提醒：本登记任一参会人姓名出现在其他登记中、或同一姓名对应多位参会人时，
     * 汇总进 duplicateNames，由后台在待审核条目上提示「有相同名字，请注意审核」。
     * 主联系人在登记表和同行人表各存一行，按「姓名+手机号」折叠成同一个人，避免误报。
     */
    private void annotateDuplicateNames(List<Application> records,
                                        Map<Long, List<ApplicationGuest>> guestsByApplication) {
        Map<String, Set<Long>> applicationsByName = new HashMap<>();
        for (Application application : applicationMapper.selectList(
                new LambdaQueryWrapper<Application>())) {
            mergeNameApplications(applicationsByName, application.getName(), application.getId());
        }
        for (ApplicationGuest guest : applicationGuestMapper.selectList(
                new LambdaQueryWrapper<ApplicationGuest>())) {
            mergeNameApplications(applicationsByName, guest.getName(), guest.getApplicationId());
        }
        for (Application record : records) {
            Map<String, Integer> ownCounts = new HashMap<>();
            Map<String, String> displayNames = new HashMap<>();
            for (String rawName : personNames(record, guestsByApplication.getOrDefault(record.getId(), List.of()))) {
                String normalized = normalizeName(rawName);
                if (normalized.isEmpty()) continue;
                ownCounts.merge(normalized, 1, Integer::sum);
                displayNames.putIfAbsent(normalized, trimToEmpty(rawName));
            }
            List<String> duplicates = new ArrayList<>();
            for (Map.Entry<String, Integer> own : ownCounts.entrySet()) {
                String normalized = own.getKey();
                boolean elsewhere = applicationsByName.getOrDefault(normalized, Set.of()).stream()
                        .anyMatch(appId -> !appId.equals(record.getId()));
                if (own.getValue() > 1 || elsewhere) {
                    duplicates.add(displayNames.get(normalized));
                }
            }
            if (!duplicates.isEmpty()) {
                record.setDuplicateNames(duplicates);
            }
        }
    }

    /** 一份登记的参会人姓名（主联系人 + 各同行人），主联系人两处存储折叠为一个人。 */
    private static List<String> personNames(Application record, List<ApplicationGuest> guests) {
        List<String> names = new ArrayList<>();
        Set<String> seenPersons = new HashSet<>();
        mergePersonName(names, seenPersons, record.getName(), record.getPhone());
        for (ApplicationGuest guest : guests) {
            mergePersonName(names, seenPersons, guest.getName(), guest.getPhone());
        }
        return names;
    }

    private static void mergePersonName(List<String> names, Set<String> seenPersons, String name, String phone) {
        String normalized = normalizeName(name);
        if (normalized.isEmpty()) return;
        if (!seenPersons.add(normalized + "\0" + trimToEmpty(phone))) return;
        names.add(trimToEmpty(name));
    }

    private static void mergeNameApplications(Map<String, Set<Long>> applicationsByName, String name, Long applicationId) {
        String normalized = normalizeName(name);
        if (normalized.isEmpty() || applicationId == null) return;
        applicationsByName.computeIfAbsent(normalized, ignored -> new HashSet<>()).add(applicationId);
    }

    private static String normalizeName(String name) {
        return trimToEmpty(name).toLowerCase(Locale.ROOT);
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
    /** 后台导出：按场次（城市）与审核状态过滤，每位参会人一行（含主联系人与同行人） */
    public java.util.List<java.util.Map<String, Object>> exportAttendees(String city, String status) {
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Application> wrapper =
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Application>()
                        .orderByAsc(Application::getId);
        if (city != null && !city.isBlank()) {
            java.util.List<String> codes = invitationMapper.selectList(
                            new LambdaQueryWrapper<Invitation>().eq(Invitation::getEventCity, city.trim()))
                    .stream().map(Invitation::getCode).toList();
            if (codes.isEmpty()) return new java.util.ArrayList<>();
            wrapper.in(Application::getInvitationCode, codes);
        }
        if (status != null && !status.isBlank()) {
            wrapper.eq(Application::getStatus, status.trim());
        }
        java.util.List<Application> apps = applicationMapper.selectList(wrapper);
        if (apps.isEmpty()) return new java.util.ArrayList<>();

        java.util.List<Long> ids = apps.stream().map(Application::getId).toList();
        java.util.List<ApplicationGuest> guests = applicationGuestMapper.selectList(
                new LambdaQueryWrapper<ApplicationGuest>()
                        .in(ApplicationGuest::getApplicationId, ids)
                        .orderByAsc(ApplicationGuest::getApplicationId)
                        .orderByAsc(ApplicationGuest::getGuestIndex));

        java.util.Map<String, String> cityByCode = new java.util.HashMap<>();
        for (Invitation invitation : invitationMapper.selectList(null)) {
            cityByCode.put(invitation.getCode(), invitation.getEventCity());
        }
        // 桌号按「场次 + 手机号」与导入的桌位匹配，未导入或未匹配时留空
        java.util.Map<String, String> tableByCityPhone = new java.util.HashMap<>();
        var seatQuery = new LambdaQueryWrapper<com.example.app.entity.Seat>();
        if (city != null && !city.isBlank()) {
            seatQuery.eq(com.example.app.entity.Seat::getEventCity, city.trim());
        }
        for (com.example.app.entity.Seat seat : seatMapper.selectList(seatQuery)) {
            tableByCityPhone.put(seat.getEventCity() + ":" + seat.getPhone(), seat.getTableNo());
        }
        java.util.Map<Long, Application> appById = new java.util.HashMap<>();
        for (Application application : apps) {
            appById.put(application.getId(), application);
        }

        java.util.List<java.util.Map<String, Object>> rows = new java.util.ArrayList<>();
        for (ApplicationGuest guest : guests) {
            Application application = appById.get(guest.getApplicationId());
            if (application == null) continue;
            String eventCity = cityByCode.getOrDefault(application.getInvitationCode(), "");
            java.util.Map<String, Object> row = new java.util.LinkedHashMap<>();
            row.put("登记编号", application.getId());
            row.put("参会人编号", guest.getId());
            row.put("登记身份", java.util.Objects.equals(guest.getPhone(), application.getPhone()) ? "主联系人" : "同行人");
            row.put("主联系人", application.getName());
            row.put("主联系人手机号", application.getPhone());
            row.put("场次", eventCity + "场");
            row.put("桌号", tableByCityPhone.getOrDefault(eventCity + ":" + guest.getPhone(), ""));
            row.put("姓名", guest.getName());
            row.put("性别", guest.getGender());
            row.put("手机号", guest.getPhone());
            row.put("公司", guest.getCompany());
            row.put("职位", guest.getPosition());
            row.put("住宿要求", guest.getAccommodation());
            row.put("房型", guest.getRoomType());
            row.put("入住日期", guest.getCheckinDate() == null ? "" : guest.getCheckinDate().toString());
            row.put("审核状态", application.getStatus());
            row.put("申请原因", application.getReason());
            row.put("审核备注", application.getReviewRemark());
            row.put("审核时间", application.getReviewedAt() == null ? "" : application.getReviewedAt().toString());
            row.put("修改次数", application.getEditCount() == null ? 0 : application.getEditCount());
            row.put("邀请码", application.getInvitationCode());
            row.put("提交时间", application.getCreatedAt() == null ? "" : application.getCreatedAt().toString());
            row.put("入场核验状态", application.getCheckedInAt() == null ? "未核验" : "已核验");
            row.put("入场核验时间", application.getCheckedInAt() == null ? "" : application.getCheckedInAt().toString());
            rows.add(row);
        }
        return rows;
    }

    public java.util.List<com.example.app.dto.AttendeeExportRow> exportAttendeeRows(String city, String status) {
        java.util.List<com.example.app.dto.AttendeeExportRow> rows = new java.util.ArrayList<>();
        long cursor = 0;
        while (true) {
            var page = exportAttendeePage(city, status, cursor, 500);
            rows.addAll(page);
            if (page.size() < 500) return rows;
            cursor = page.get(page.size() - 1).getGuestId();
        }
    }

    private Set<String> validateIdentities(List<GuestRequest> guests, Long currentApplicationId,
                                           Map<String, Integer> oldCounts) {
        Map<String, Integer> counts = new HashMap<>();
        Set<String> keys = new HashSet<>();
        for (GuestRequest guest : guests) {
            String name = trimToEmpty(guest.getName());
            String company = trimToEmpty(guest.getCompany());
            if (name.isEmpty()) throw new BizException(ErrorCode.BAD_REQUEST, "参会人姓名不能为空");
            String key = identityKey(name, company);
            int count = counts.merge(key, 1, Integer::sum);
            if (count > Math.max(1, oldCounts.getOrDefault(key, 0))) {
                throw new BizException(ErrorCode.NAME_COMPANY_DUPLICATED);
            }
            keys.add(key);
            // 历史登记原有的身份组合可以保留；新增组合必须检查所有历史记录。
            if (oldCounts.containsKey(key)) continue;
            String normalizedName = name.toLowerCase(Locale.ROOT);
            String normalizedCompany = company.toLowerCase(Locale.ROOT);
            Long guestMatches = applicationGuestMapper.selectCount(new LambdaQueryWrapper<ApplicationGuest>()
                    .apply("LOWER(TRIM(name)) = {0}", normalizedName)
                    .apply("LOWER(TRIM(COALESCE(company, ''))) = {0}", normalizedCompany)
                    .ne(currentApplicationId != null, ApplicationGuest::getApplicationId, currentApplicationId));
            Long applicationMatches = applicationMapper.selectCount(new LambdaQueryWrapper<Application>()
                    .apply("LOWER(TRIM(name)) = {0}", normalizedName)
                    .apply("LOWER(TRIM(COALESCE(company, ''))) = {0}", normalizedCompany)
                    .ne(currentApplicationId != null, Application::getId, currentApplicationId));
            if ((guestMatches != null && guestMatches > 0) || (applicationMatches != null && applicationMatches > 0)) {
                throw new BizException(ErrorCode.NAME_COMPANY_DUPLICATED);
            }
        }
        return keys;
    }

    private static Map<String, Integer> identityCounts(List<ApplicationGuest> guests) {
        Map<String, Integer> counts = new HashMap<>();
        for (ApplicationGuest guest : guests) {
            String key = identityKey(trimToEmpty(guest.getName()), trimToEmpty(guest.getCompany()));
            counts.merge(key, 1, Integer::sum);
        }
        return counts;
    }

    private void reserveIdentities(Set<String> keys, Long applicationId) {
        for (String key : keys) {
            RegistrationIdentity identity = new RegistrationIdentity();
            identity.setIdentityKey(key);
            identity.setApplicationId(applicationId);
            try {
                registrationIdentityMapper.insert(identity);
            } catch (DuplicateKeyException ex) {
                throw new BizException(ErrorCode.NAME_COMPANY_DUPLICATED);
            }
        }
    }

    private static String identityKey(String name, String company) {
        String value = name.toLowerCase(Locale.ROOT) + "\0" + company.toLowerCase(Locale.ROOT);
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 unavailable", ex);
        }
    }

    public java.util.List<com.example.app.dto.AttendeeExportRow> exportAttendeePage(String city, String status,
                                                                                      long afterGuestId, int limit) {
        String normalizedCity = city == null ? "" : city.trim();
        String normalizedStatus = status == null ? "" : status.trim();
        return applicationMapper.selectAttendeeExport(normalizedCity, normalizedStatus, afterGuestId, limit);
    }

    /** 后台导出用：全量登记与明细（活动规模下数据量可控，避免逐行查询） */
    public java.util.List<Application> findAllApplications() {
        return applicationMapper.selectList(null);
    }

    public java.util.List<ApplicationGuest> findAllGuests() {
        return applicationGuestMapper.selectList(null);
    }

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
        return review(id, target, remark, null, null);
    }

    /** 带审核人留痕的审核；操作人可为后台管理员或邀请人 */
    @Transactional
    public Application review(Long id, ApplyStatus target, String remark, Long operatorId, String operatorName) {
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
        int updated = applicationMapper.reviewIfPending(id, target.name(), trimToNull(remark), operatorId, operatorName);
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
