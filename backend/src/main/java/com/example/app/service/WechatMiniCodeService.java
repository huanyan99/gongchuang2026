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

import java.time.LocalDateTime;
import java.util.Base64;
import java.util.Map;

@Service
@Slf4j
@RequiredArgsConstructor
public class WechatMiniCodeService {
    private final RestClient wxRestClient;
    private final ObjectMapper objectMapper;
    @Value("${wechat.appid}") private String appid;
    @Value("${wechat.secret}") private String secret;
    private String accessToken;
    private LocalDateTime tokenExpiresAt;

    public Map<String, String> create(String invitationCode) {
        String url = "https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=" + token();
        byte[] image = wxRestClient.post().uri(url)
                .body(Map.of("scene", "i=" + invitationCode, "page", "pages/index/index", "check_path", false))
                .retrieve().body(byte[].class);
        if (image == null || image.length < 8 || image[0] != (byte) 0x89 || image[1] != 0x50) {
            throw new BizException(ErrorCode.WECHAT_API_ERROR, "小程序码生成失败，请检查微信 AppID、AppSecret 和发布页面");
        }
        return Map.of("imageBase64", Base64.getEncoder().encodeToString(image));
    }

    synchronized String token() {
        if (accessToken != null && tokenExpiresAt != null && tokenExpiresAt.isAfter(LocalDateTime.now())) return accessToken;
        String url = UriComponentsBuilder.fromUriString("https://api.weixin.qq.com/cgi-bin/token")
                .queryParam("grant_type", "client_credential").queryParam("appid", appid).queryParam("secret", secret)
                .build().toUriString();
        Map<String, Object> body;
        try {
            String response = wxRestClient.get().uri(url).retrieve().body(String.class);
            body = objectMapper.readValue(response, new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            log.warn("微信接口凭证异常: type={}", e.getClass().getSimpleName());
            throw new BizException(ErrorCode.WECHAT_API_ERROR, "微信接口凭证获取或解析失败（阶段：获取 access_token）");
        }
        if (body == null || body.get("access_token") == null) {
            int wxCode = body != null && body.get("errcode") instanceof Number
                    ? ((Number) body.get("errcode")).intValue() : -1;
            log.warn("微信接口凭证失败: errcode={}", wxCode);
            throw new BizException(ErrorCode.WECHAT_API_ERROR, "无法获取微信接口凭证（微信错误码：" + wxCode + "）");
        }
        accessToken = String.valueOf(body.get("access_token"));
        int expires = body.get("expires_in") instanceof Number ? ((Number) body.get("expires_in")).intValue() : 7200;
        tokenExpiresAt = LocalDateTime.now().plusSeconds(Math.max(60, expires - 300));
        return accessToken;
    }
}
