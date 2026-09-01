package com.example.app.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.example.app.common.ApplyStatus;
import com.example.app.common.BizException;
import com.example.app.common.ErrorCode;
import com.example.app.common.Result;
import com.example.app.config.UserContext;
import com.example.app.dto.InvitationCreateRequest;
import com.example.app.dto.ReviewRequest;
import com.example.app.entity.Application;
import com.example.app.entity.Invitation;
import com.example.app.entity.User;
import com.example.app.mapper.ApplicationMapper;
import com.example.app.service.ApplicationService;
import com.example.app.service.InvitationService;
import com.example.app.service.WechatMiniCodeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/invitations")
@RequiredArgsConstructor
public class InvitationManagementController {
    private final InvitationService invitationService;
    private final ApplicationService applicationService;
    private final ApplicationMapper applicationMapper;
    private final WechatMiniCodeService wechatMiniCodeService;

    @GetMapping("/permissions")
    public Result<Map<String, Boolean>> permissions() {
        User user = UserContext.require();
        Map<String, Boolean> body = new HashMap<>();
        body.put("canInvite", Boolean.TRUE.equals(user.getCanInvite()));
        body.put("canReview", Boolean.TRUE.equals(user.getCanReview()));
        return Result.ok(body);
    }

    @PostMapping
    public Result<Invitation> create(@Valid @RequestBody InvitationCreateRequest req) {
        return Result.ok(invitationService.createDirected(req, UserContext.require()));
    }

    @GetMapping("/mine")
    public Result<List<Invitation>> mine() {
        return Result.ok(invitationService.listMine(UserContext.require()));
    }

    @GetMapping("/{code}/mini-code")
    public Result<Map<String, String>> miniCode(@PathVariable String code) {
        User user = UserContext.require();
        invitationService.requireInvitePermission(user);
        Invitation invitation = invitationService.getByCode(code);
        if (!Boolean.TRUE.equals(user.getCanReview()) && !user.getId().equals(invitation.getInviterUserId())) {
            throw new BizException(ErrorCode.UNAUTHORIZED, "只能生成自己邀请的小程序码");
        }
        return Result.ok(wechatMiniCodeService.create(invitation.getCode()));
    }

    @GetMapping("/applications")
    public Result<List<Application>> applications() {
        User user = UserContext.require();
        invitationService.requireInvitePermission(user);
        LambdaQueryWrapper<Application> query = new LambdaQueryWrapper<Application>().orderByDesc(Application::getId);
        if (!Boolean.TRUE.equals(user.getCanReview())) {
            List<String> codes = invitationService.listMine(user).stream().map(Invitation::getCode).toList();
            if (codes.isEmpty()) return Result.ok(List.of());
            query.in(Application::getInvitationCode, codes);
        }
        List<Application> applications = applicationMapper.selectList(query);
        applications.forEach(item -> item.setAttendees(applicationService.loadGuests(item.getId())));
        return Result.ok(applications);
    }

    @PostMapping("/applications/{id}/review")
    public Result<Application> review(@PathVariable Long id, @Valid @RequestBody ReviewRequest req) {
        User user = UserContext.require();
        invitationService.requireInvitePermission(user);
        Application application = applicationMapper.selectById(id);
        if (application == null) throw new BizException(ErrorCode.APPLY_NOT_FOUND);
        if (!Boolean.TRUE.equals(user.getCanReview())) {
            Invitation invitation = invitationService.getByCode(application.getInvitationCode());
            if (!user.getId().equals(invitation.getInviterUserId())) {
                throw new BizException(ErrorCode.UNAUTHORIZED, "只能审核自己邀请的嘉宾");
            }
        }
        return Result.ok(applicationService.review(id, ApplyStatus.of(req.getStatus()), req.getRemark()));
    }
}
