package com.example.app.controller;

import com.example.app.config.AdminAuth;
import com.example.app.dto.Result;
import com.example.app.dto.ReviewRequest;
import com.example.app.entity.Application;
import com.example.app.entity.Invitation;
import com.example.app.service.ApplicationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** 管理端接口：请求头需带 X-Admin-Key */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

    private final ApplicationService applicationService;
    private final AdminAuth adminAuth;

    /** 生成邀请码 */
    @PostMapping("/invitation")
    public Result<Invitation> createInvitation(@RequestParam(defaultValue = "100") int maxUses,
                                               @RequestHeader("X-Admin-Key") String adminKey) {
        adminAuth.verify(adminKey);
        return Result.ok(applicationService.createInvitation(maxUses));
    }

    /** 申报列表，status 为空时查全部 */
    @GetMapping("/applications")
    public Result<List<Application>> list(@RequestParam(required = false) String status,
                                         @RequestHeader("X-Admin-Key") String adminKey) {
        adminAuth.verify(adminKey);
        return Result.ok(applicationService.listByStatus(status));
    }

    /** 审核 */
    @PostMapping("/applications/{id}/review")
    public Result<Application> review(@PathVariable Long id,
                                      @Valid @RequestBody ReviewRequest req,
                                      @RequestHeader("X-Admin-Key") String adminKey) {
        adminAuth.verify(adminKey);
        return Result.ok(applicationService.review(id, req.getStatus(), req.getRemark()));
    }

    /** 简单统计 */
    @GetMapping("/stats")
    public Result<Map<String, Long>> stats(@RequestHeader("X-Admin-Key") String adminKey) {
        adminAuth.verify(adminKey);
        long pending = applicationService.listByStatus("PENDING").size();
        long approved = applicationService.listByStatus("APPROVED").size();
        long rejected = applicationService.listByStatus("REJECTED").size();
        return Result.ok(Map.of("pending", pending, "approved", approved, "rejected", rejected));
    }
}
