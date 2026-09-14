package com.example.app.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.example.app.common.ApplyStatus;
import com.example.app.common.Result;
import com.example.app.dto.AdminLoginRequest;
import com.example.app.dto.AdminPasswordRequest;
import com.example.app.dto.AccessPassRequest;
import com.example.app.dto.CheckinRequest;
import com.example.app.dto.ReviewRequest;
import com.example.app.dto.SeatImportRequest;
import com.example.app.entity.Application;
import com.example.app.entity.Invitation;
import com.example.app.entity.Seat;
import com.example.app.entity.AdminUser;
import com.example.app.entity.User;
import com.example.app.mapper.UserMapper;
import com.example.app.service.ApplicationService;
import com.example.app.service.InvitationService;
import com.example.app.service.AdminAccountService;
import com.example.app.service.PassService;
import com.example.app.service.SeatService;
import com.example.app.service.SettingService;
import com.example.app.service.LoginAuditService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.List;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;

/** 管理端接口：请求头需带 X-Admin-Key */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
@Validated
public class AdminController {

    private static final int MAX_PAGE_SIZE = 100;

    private final ApplicationService applicationService;
    private final InvitationService invitationService;
    private final AdminAccountService adminAccountService;
    private final PassService passService;
    private final UserMapper userMapper;
    private final SeatService seatService;
    private final SettingService settingService;
    private final LoginAuditService loginAuditService;

    /** 账号口令登录，返回后台会话 token（后续请求放在 X-Admin-Token） */
    @PostMapping("/login")
    public Result<Map<String, Object>> login(@Valid @RequestBody AdminLoginRequest req, HttpServletRequest request) {
        return Result.ok(adminAccountService.login(req.getUsername(), req.getPassword(), clientIp(request)));
    }

    @PostMapping("/logout")
    public Result<Void> logout(@RequestHeader(value = "X-Admin-Token", required = false) String adminToken) {
        adminAccountService.logout(adminToken);
        return Result.ok();
    }

    /** 校验会话是否仍然有效 */
    @GetMapping("/session")
    public Result<Map<String, Object>> session(@RequestHeader(value = "X-Admin-Token", required = false) String adminToken) {
        AdminUser admin = adminAccountService.require(adminToken);
        Map<String, Object> body = new HashMap<>();
        body.put("username", admin.getUsername());
        body.put("displayName", admin.getDisplayName());
        return Result.ok(body);
    }

    @PostMapping("/password")
    public Result<Void> changePassword(@Valid @RequestBody AdminPasswordRequest req,
                                       @RequestHeader(value = "X-Admin-Token", required = false) String adminToken) {
        AdminUser admin = adminAccountService.require(adminToken);
        adminAccountService.changePassword(admin, req.getCurrentPassword(), req.getNewPassword());
        return Result.ok();
    }

    /** 现场通道：生成带二维码的扫码入口 */
    @PostMapping("/passes")
    public Result<Map<String, Object>> createPass(@Valid @RequestBody AccessPassRequest req,
                                                  @RequestHeader(value = "X-Admin-Token", required = false) String adminToken) {
        adminAccountService.require(adminToken);
        return Result.ok(passService.create(req.getEventCity(), req.getNote()));
    }

    /** 首页 / 抽奖码入口二维码：不含密钥，扫码后按正常登录流程走 */
    @GetMapping("/qrcode")
    public Result<Map<String, Object>> entryQrCode(@RequestParam(defaultValue = "home") String target,
                                                   @RequestHeader(value = "X-Admin-Token", required = false) String adminToken) {
        adminAccountService.require(adminToken);
        return Result.ok(passService.entryQrCode(target));
    }

    @GetMapping("/passes")
    public Result<List<Map<String, Object>>> passes(@RequestHeader(value = "X-Admin-Token", required = false) String adminToken) {
        adminAccountService.require(adminToken);
        return Result.ok(passService.list());
    }

    @PostMapping("/passes/{id}/disable")
    public Result<Map<String, Object>> disablePass(@PathVariable @Min(1) Long id,
                                                   @RequestHeader(value = "X-Admin-Token", required = false) String adminToken) {
        adminAccountService.require(adminToken);
        return Result.ok(passService.disable(id));
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) return forwarded.split(",")[0].trim();
        return request.getRemoteAddr();
    }

    /** 可授权用户列表（openid、token 等敏感字段由实体注解隐藏） */
    @GetMapping("/users")
    public Result<List<Map<String, Object>>> users(@RequestHeader(value = "X-Admin-Token", required = false) String adminToken) {
        adminAccountService.require(adminToken);
        List<Map<String, Object>> rows = userMapper.selectList(
                new LambdaQueryWrapper<User>().orderByDesc(User::getId)).stream().map(user -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", user.getId());
            row.put("name", user.getName());
            row.put("phone", user.getPhone());
            row.put("gender", user.getGender());
            row.put("canInvite", user.getCanInvite());
            row.put("canReview", user.getCanReview());
            row.put("deviceBound", user.getDeviceId() != null && !user.getDeviceId().isBlank());
            row.put("createdAt", user.getCreatedAt());
            return row;
        }).toList();
        return Result.ok(rows);
    }

    /** 开通或关闭“我的邀请”和全局审核权限 */
    @PostMapping("/users/{id}/invitation-permissions")
    public Result<User> updateInvitationPermissions(
            @PathVariable @Min(1) Long id,
            @RequestParam boolean canInvite,
            @RequestParam(defaultValue = "false") boolean canReview,
            @RequestHeader(value = "X-Admin-Token", required = false) String adminToken) {
        adminAccountService.require(adminToken);
        User user = userMapper.selectById(id);
        if (user == null) throw new com.example.app.common.BizException(com.example.app.common.ErrorCode.NOT_FOUND, "用户不存在");
        user.setCanInvite(canInvite);
        user.setCanReview(canReview);
        userMapper.updateById(user);
        return Result.ok(userMapper.selectById(id));
    }

    /** 生成邀请码 */
    @PostMapping("/invitation")
    public Result<Invitation> createInvitation(
            @RequestParam(defaultValue = "100") @Min(1) @Max(100000) int maxUses,
            @RequestHeader(value = "X-Admin-Token", required = false) String adminToken) {
        adminAccountService.require(adminToken);
        return Result.ok(invitationService.create(maxUses));
    }

    /** 申报分页列表，status 可选（PENDING/APPROVED/REJECTED） */
    @GetMapping("/applications")
    public Result<Map<String, Object>> list(
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") @Min(1) long page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(MAX_PAGE_SIZE) long size,
            @RequestHeader(value = "X-Admin-Token", required = false) String adminToken) {
        adminAccountService.require(adminToken);
        if (status != null && !status.isBlank()) {
            status = ApplyStatus.of(status).name();
        }
        Page<Application> result = applicationService.page(page, size, status);
        Map<String, Object> body = new HashMap<>();
        body.put("records", result.getRecords());
        body.put("total", result.getTotal());
        body.put("page", result.getCurrent());
        body.put("size", result.getSize());
        body.put("pages", result.getPages());
        return Result.ok(body);
    }

    /** 审核申报 */
    @PostMapping("/applications/{id}/review")
    public Result<Application> review(@PathVariable @Min(1) Long id,
                                      @Valid @RequestBody ReviewRequest req,
                                      @RequestHeader(value = "X-Admin-Token", required = false) String adminToken) {
        adminAccountService.require(adminToken);
        return Result.ok(applicationService.review(id, ApplyStatus.of(req.getStatus()), req.getRemark()));
    }

    /** 扫码入场核验 */
    @PostMapping("/checkin")
    public Result<Application> checkin(@Valid @RequestBody CheckinRequest req,
                                       @RequestHeader(value = "X-Admin-Token", required = false) String adminToken) {
        adminAccountService.require(adminToken);
        return Result.ok(applicationService.checkIn(req.getToken()));
    }

    /** 批量导入桌位；mode=REPLACE 时先清空该场次 */
    @PostMapping("/seats/import")
    public Result<Map<String, Object>> importSeats(@Valid @RequestBody SeatImportRequest req,
                                                   @RequestHeader(value = "X-Admin-Token", required = false) String adminToken) {
        adminAccountService.require(adminToken);
        List<Seat> rows = req.getRows().stream().map((row) -> {
            Seat seat = new Seat();
            seat.setName(row.getName());
            seat.setPhone(row.getPhone());
            seat.setTableNo(row.getTableNo());
            seat.setRemark(row.getRemark());
            return seat;
        }).toList();
        return Result.ok(seatService.importSeats(req.getEventCity(), req.getMode(), rows));
    }

    /** 桌位分页列表，city 为空查全部 */
    @GetMapping("/seats")
    public Result<Map<String, Object>> seats(
            @RequestParam(required = false) String city,
            @RequestParam(defaultValue = "1") @Min(1) long page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(MAX_PAGE_SIZE) long size,
            @RequestHeader(value = "X-Admin-Token", required = false) String adminToken) {
        adminAccountService.require(adminToken);
        return Result.ok(seatService.page(city, page, size));
    }

    /** 解绑用户设备：邀请人换手机后由管理员放行 */
    @PostMapping("/users/{id}/reset-device")
    public Result<User> resetDevice(@PathVariable @Min(1) Long id,
                                    @RequestHeader(value = "X-Admin-Token", required = false) String adminToken) {
        AdminUser admin = adminAccountService.require(adminToken);
        User user = userMapper.selectById(id);
        if (user == null) {
            throw new com.example.app.common.BizException(com.example.app.common.ErrorCode.NOT_FOUND, "用户不存在");
        }
        loginAuditService.recordAdminReset(user, admin);
        userMapper.update(null, new com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<User>()
                .eq(User::getId, id)
                .set(User::getDeviceId, null)
                .set(User::getToken, null)
                .set(User::getTokenExpire, null));
        return Result.ok(userMapper.selectById(id));
    }

    /** 登录与设备操作审计，userId 为空时查看全部。 */
    @GetMapping("/login-audits")
    public Result<Map<String, Object>> loginAudits(
            @RequestParam(required = false) Long userId,
            @RequestParam(defaultValue = "1") @Min(1) long page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(MAX_PAGE_SIZE) long size,
            @RequestHeader(value = "X-Admin-Token", required = false) String adminToken) {
        adminAccountService.require(adminToken);
        Page<com.example.app.entity.LoginAudit> result = loginAuditService.page(userId, page, size);
        Map<String, Object> body = new HashMap<>();
        body.put("records", result.getRecords());
        body.put("total", result.getTotal());
        body.put("page", result.getCurrent());
        body.put("size", result.getSize());
        return Result.ok(body);
    }

    /** 读取后台开关 */
    @GetMapping("/settings")
    public Result<Map<String, Boolean>> settings(@RequestHeader(value = "X-Admin-Token", required = false) String adminToken) {
        adminAccountService.require(adminToken);
        return Result.ok(settingService.all());
    }

    /** 开关：是否对普通嘉宾也执行一个账号一台设备 */
    @PostMapping("/settings/{key}")
    public Result<Map<String, Boolean>> updateSetting(@PathVariable String key,
                                                      @RequestParam boolean enabled,
                                                      @RequestHeader(value = "X-Admin-Token", required = false) String adminToken) {
        adminAccountService.require(adminToken);
        if (!SettingService.DEVICE_BINDING_GUESTS.equals(key)
                && !SettingService.DEVICE_BINDING_INVITERS.equals(key)) {
            throw new com.example.app.common.BizException(com.example.app.common.ErrorCode.BAD_REQUEST, "未知开关");
        }
        settingService.setEnabled(key, enabled);
        return Result.ok(settingService.all());
    }

    /** 按状态统计数量 */
    @GetMapping("/stats")
    public Result<Map<String, Long>> stats(@RequestHeader(value = "X-Admin-Token", required = false) String adminToken) {
        adminAccountService.require(adminToken);
        Map<String, Long> stats = new HashMap<>();
        applicationService.countByStatus().forEach((status, count) ->
                stats.put(status.name().toLowerCase(), count));
        return Result.ok(stats);
    }
}
