package com.example.app.service;

import com.example.app.common.BizException;
import com.example.app.common.ErrorCode;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;

/** 公众号网页 JS-SDK 签名；access_token 与 jsapi_ticket 只在后端缓存。 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WechatJsSdkService {
    private final RestClient wxRestClient;
    private final ObjectMapper objectMapper;
    private final SecureRandom random = new SecureRandom();

    @Value("${wechat.official-account.appid:}") private String appid;
    @Value("${wechat.official-account.secret:}") private String secret;
    @Value("${wechat.official-account.js-sdk-domain:pmt.fscut.com}") private String allowedDomain;

    private String accessToken;
    private Instant accessTokenExpiresAt;
    private String jsapiTicket;
    private Instant ticketExpiresAt;

    public Map<String, Object> signature(String pageUrl) {
        String normalizedUrl = validateUrl(pageUrl);
        long timestamp = Instant.now().getEpochSecond();
        String nonce = nonce();
        String source = "jsapi_ticket=" + ticket()
                + "&noncestr=" + nonce
                + "&timestamp=" + timestamp
                + "&url=" + normalizedUrl;
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("appId", appid);
        result.put("timestamp", timestamp);
        result.put("nonceStr", nonce);
        result.put("signature", sha1(source));
        return result;
    }

    private String validateUrl(String pageUrl) {
        try {
            URI uri = URI.create(pageUrl == null ? "" : pageUrl.trim());
            String host = uri.getHost();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null
                    || !host.equalsIgnoreCase(allowedDomain) || uri.getUserInfo() != null) {
                throw new IllegalArgumentException();
            }
            String raw = pageUrl.trim();
            int hash = raw.indexOf('#');
            return hash >= 0 ? raw.substring(0, hash) : raw;
        } catch (Exception e) {
            throw new BizException(ErrorCode.BAD_REQUEST, "仅允许为正式网页域名生成微信签名");
        }
    }

    private synchronized String ticket() {
        if (jsapiTicket != null && ticketExpiresAt != null && ticketExpiresAt.isAfter(Instant.now())) {
            return jsapiTicket;
        }
        Map<String, Object> body = getJson(UriComponentsBuilder
                .fromUriString("https://api.weixin.qq.com/cgi-bin/ticket/getticket")
                .queryParam("access_token", token()).queryParam("type", "jsapi")
                .build().toUriString(), "获取 jsapi_ticket");
        if (((Number) body.getOrDefault("errcode", -1)).intValue() != 0 || body.get("ticket") == null) {
            int code = ((Number) body.getOrDefault("errcode", -1)).intValue();
            log.warn("微信公众号 jsapi_ticket 获取失败: errcode={}", code);
            throw new BizException(ErrorCode.WECHAT_API_ERROR, "微信公众号分享凭证获取失败（微信错误码：" + code + "）");
        }
        jsapiTicket = String.valueOf(body.get("ticket"));
        int expires = ((Number) body.getOrDefault("expires_in", 7200)).intValue();
        ticketExpiresAt = Instant.now().plusSeconds(Math.max(60, expires - 300));
        return jsapiTicket;
    }

    private synchronized String token() {
        if (accessToken != null && accessTokenExpiresAt != null && accessTokenExpiresAt.isAfter(Instant.now())) {
            return accessToken;
        }
        if (appid == null || appid.isBlank() || secret == null || secret.isBlank()) {
            throw new BizException(ErrorCode.WECHAT_API_ERROR, "微信公众号分享配置未完成");
        }
        Map<String, Object> body = getJson(UriComponentsBuilder
                .fromUriString("https://api.weixin.qq.com/cgi-bin/token")
                .queryParam("grant_type", "client_credential")
                .queryParam("appid", appid).queryParam("secret", secret)
                .build().toUriString(), "获取 access_token");
        if (body.get("access_token") == null) {
            int code = ((Number) body.getOrDefault("errcode", -1)).intValue();
            log.warn("微信公众号 access_token 获取失败: errcode={}", code);
            throw new BizException(ErrorCode.WECHAT_API_ERROR, "微信公众号接口凭证获取失败（微信错误码：" + code + "）");
        }
        accessToken = String.valueOf(body.get("access_token"));
        int expires = ((Number) body.getOrDefault("expires_in", 7200)).intValue();
        accessTokenExpiresAt = Instant.now().plusSeconds(Math.max(60, expires - 300));
        return accessToken;
    }

    private Map<String, Object> getJson(String url, String stage) {
        try {
            String response = wxRestClient.get().uri(url).retrieve().body(String.class);
            return objectMapper.readValue(response, new TypeReference<Map<String, Object>>() {});
        } catch (BizException e) {
            throw e;
        } catch (Exception e) {
            log.warn("微信公众号接口异常: stage={} type={}", stage, e.getClass().getSimpleName());
            throw new BizException(ErrorCode.WECHAT_API_ERROR, "微信公众号接口连接或解析失败（阶段：" + stage + "）");
        }
    }

    private String nonce() {
        byte[] bytes = new byte[16];
        random.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }

    private String sha1(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-1")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("SHA-1 unavailable", e);
        }
    }
}
