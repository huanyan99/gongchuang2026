package com.example.app.controller;

import com.example.app.common.BizException;
import com.example.app.common.ErrorCode;
import com.example.app.common.Result;
import com.example.app.config.UserContext;
import com.example.app.dto.ApplyRequest;
import com.example.app.dto.TicketResponse;
import com.example.app.entity.Application;
import com.example.app.service.ApplicationService;
import com.example.app.service.InvitationService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

/** 受邀人侧接口：校验邀请码公开，申报/查询/入场码需登录 */
@RestController
@RequestMapping("/api/apply")
@RequiredArgsConstructor
@Validated
public class ApplyController {

    private final ApplicationService applicationService;
    private final InvitationService invitationService;

    /** 打开邀请函时校验邀请码可用性 */
    @GetMapping("/check-invitation")
    public Result<Map<String, Object>> checkInvitation(@RequestParam @NotBlank String code) {
        invitationService.checkUsable(code);
        var invitation = invitationService.getByCode(code);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("valid", true);
        body.put("eventCity", invitation.getEventCity());
        body.put("inviterName", invitation.getInviterName());
        return Result.ok(body);
    }

    /** 提交申报 */
    @PostMapping
    public Result<Application> submit(@Valid @RequestBody ApplyRequest req) {
        return Result.ok(applicationService.submit(req, UserContext.require()));
    }

    /** 修改登记信息，最多两次；每次修改后重新进入待审核 */
    @PutMapping
    public Result<Application> resubmit(@Valid @RequestBody ApplyRequest req) {
        return Result.ok(applicationService.resubmit(req, UserContext.require()));
    }

    /** 查询当前登录用户的申报与审核状态 */
    @GetMapping("/me")
    public Result<Application> me() {
        Application application = applicationService.getByUser(UserContext.require());
        if (application == null) {
            throw new BizException(ErrorCode.APPLY_NOT_FOUND);
        }
        application.setEventCity(invitationService.getByCode(application.getInvitationCode()).getEventCity());
        application.setAttendees(applicationService.loadGuests(application.getId()));
        return Result.ok(application);
    }

    /** 入场核验二维码（仅审核通过后下发短时凭证） */
    @GetMapping("/ticket")
    public Result<TicketResponse> ticket() {
        return Result.ok(applicationService.issueTicket(UserContext.require()));
    }
}
