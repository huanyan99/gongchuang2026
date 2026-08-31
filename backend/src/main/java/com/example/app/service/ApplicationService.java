package com.example.app.service;

import com.example.app.dto.ApplyRequest;
import com.example.app.entity.Application;
import com.example.app.entity.Invitation;
import com.example.app.mapper.ApplicationMapper;
import com.example.app.mapper.InvitationMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ApplicationService {

    private final ApplicationMapper applicationMapper;
    private final InvitationMapper invitationMapper;

    /** 校验邀请码有效性（打开邀请函时调用） */
    public void checkInvitation(String code) {
        Invitation invitation = invitationMapper.selectByCode(code);
        if (invitation == null) {
            throw new IllegalArgumentException("邀请码无效");
        }
        if (invitation.getUsedCount() >= invitation.getMaxUses()) {
            throw new IllegalArgumentException("该邀请码已达使用上限");
        }
    }

    @Transactional
    public Application submit(ApplyRequest req) {
        // 校验邀请码
        Invitation invitation = invitationMapper.selectByCode(req.getInvitationCode());
        if (invitation == null) {
            throw new IllegalArgumentException("邀请码无效");
        }
        if (invitation.getUsedCount() >= invitation.getMaxUses()) {
            throw new IllegalArgumentException("该邀请码已达使用上限");
        }
        // 同一手机号不允许重复申报
        if (applicationMapper.selectByPhone(req.getPhone()) != null) {
            throw new IllegalArgumentException("该手机号已提交过申报，请勿重复提交");
        }

        Application app = new Application();
        app.setInvitationCode(req.getInvitationCode());
        app.setName(req.getName());
        app.setPhone(req.getPhone());
        app.setCompany(req.getCompany());
        app.setPosition(req.getPosition());
        app.setReason(req.getReason());
        applicationMapper.insert(app);
        invitationMapper.increaseUsedCount(invitation.getId());
        return app;
    }

    /** 生成新邀请码（管理端调用） */
    public Invitation createInvitation(int maxUses) {
        Invitation invitation = new Invitation();
        invitation.setCode(UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase());
        invitation.setMaxUses(maxUses);
        invitation.setUsedCount(0);
        invitationMapper.insert(invitation);
        return invitation;
    }

    public Application checkStatus(String phone) {
        return applicationMapper.selectByPhone(phone);
    }

    public List<Application> listByStatus(String status) {
        return applicationMapper.selectByStatus(status);
    }

    public Application review(Long id, String status, String remark) {
        if (!"APPROVED".equals(status) && !"REJECTED".equals(status)) {
            throw new IllegalArgumentException("status 只能是 APPROVED 或 REJECTED");
        }
        applicationMapper.updateStatus(id, status, remark);
        return applicationMapper.selectById(id);
    }
}
