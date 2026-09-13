package com.example.app.service;

import com.example.app.common.BizException;
import com.example.app.common.ErrorCode;
import com.example.app.entity.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 公众号消息登录（网页版）：
 * 用户关注公众号或发送任意消息，后端回复「4 位登录码 + 一键登录链接」；
 * 网页端用登录码或链接里的 ticket 换正式 token。
 * 码/ticket 均为一次性、限时有效；单实例内存存储，重启即失效。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WechatLoginService {

    private final AuthService authService;
    private final SecureRandom random = new SecureRandom();

    @Value("${wechat.official-account.web-base-url:https://pmt.fscut.com}")
    private String webBaseUrl;

    @Value("${wechat.login-code.length:4}")
    private int codeLength;

    private static final Duration VALIDITY = Duration.ofMinutes(10);

    private record Entry(String openid, Instant expiresAt) {}

    private final Map<String, Entry> codeStore = new ConcurrentHashMap<>();
    private final Map<String, Entry> ticketStore = new ConcurrentHashMap<>();

    /** 生成与活跃登录码不冲突的数字码 */
    public synchronized String createLoginCode(String openid) {
        purge();
        String code;
        do {
            StringBuilder sb = new StringBuilder(codeLength);
            for (int i = 0; i < codeLength; i++) {
                sb.append(random.nextInt(10));
            }
            code = sb.toString();
        } while (codeStore.containsKey(code));
        codeStore.put(code, new Entry(openid, Instant.now().plus(VALIDITY)));
        return code;
    }

    /** 生成一键登录 ticket（URL 里携带，一次性） */
    public String createLoginTicket(String openid) {
        purge();
        String ticket = UUID.randomUUID().toString().replace("-", "");
        ticketStore.put(ticket, new Entry(openid, Instant.now().plus(VALIDITY)));
        return ticket;
    }

    /** 登录码换正式会话 */
    public User loginByCode(String code) {
        Entry entry = codeStore.remove(String.valueOf(code).trim());
        return consume(entry, "登录码");
    }

    /** 一键登录 ticket 换正式会话 */
    public User loginByTicket(String ticket) {
        Entry entry = ticketStore.remove(String.valueOf(ticket).trim());
        return consume(entry, "登录链接");
    }

    private User consume(Entry entry, String label) {
        if (entry == null || entry.expiresAt().isBefore(Instant.now())) {
            throw new BizException(ErrorCode.BAD_REQUEST, label + "无效或已过期，请重新获取");
        }
        return authService.loginByOpenid(entry.openid());
    }

    /** 构建关注/收消息后的被动回复文案（含登录码 + 一键登录链接） */
    public String buildReplyContent(String openid, boolean welcome) {
        String code = createLoginCode(openid);
        String ticket = createLoginTicket(openid);
        String link = webBaseUrl + "/?tk=" + ticket + "#/";
        StringBuilder sb = new StringBuilder();
        if (welcome) {
            sb.append("欢迎关注！这里是柏楚2026价值共创峰会服务平台。\n\n");
        }
        sb.append("您的登录码：").append(code).append("（10分钟内有效）\n")
          .append("点击链接一键登录：\n")
          .append(link).append("\n\n")
          .append("也可以在本网页输入登录码登录；再次获取请给本公众号发送任意消息。");
        return sb.toString();
    }

    private void purge() {
        Instant now = Instant.now();
        codeStore.entrySet().removeIf(e -> e.getValue().expiresAt().isBefore(now));
        ticketStore.entrySet().removeIf(e -> e.getValue().expiresAt().isBefore(now));
        if (codeStore.size() > 10_000) {
            log.warn("活跃登录码数量异常：{}", codeStore.size());
        }
    }
}
