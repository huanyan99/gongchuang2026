package com.example.app.service;

import com.example.app.common.BizException;
import com.example.app.common.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.time.LocalDateTime;
import java.util.Base64;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class WechatMiniCodeService {
    private final RestClient wxRestClient;
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

    @SuppressWarnings("unchecked")
    private synchronized String token() {
        if (accessToken != null && tokenExpiresAt != null && tokenExpiresAt.isAfter(LocalDateTime.now())) return accessToken;
        String url = UriComponentsBuilder.fromUriString("https://api.weixin.qq.com/cgi-bin/token")
                .queryParam("grant_type", "client_credential").queryParam("appid", appid).queryParam("secret", secret)
                .build().toUriString();
        Map<String, Object> body = wxRestClient.get().uri(url).retrieve().body(Map.class);
        if (body == null || body.get("access_token") == null) {
            throw new BizException(ErrorCode.WECHAT_API_ERROR, "无法获取微信接口凭证");
        }
        accessToken = String.valueOf(body.get("access_token"));
        int expires = body.get("expires_in") instanceof Number ? ((Number) body.get("expires_in")).intValue() : 7200;
        tokenExpiresAt = LocalDateTime.now().plusSeconds(Math.max(60, expires - 300));
        return accessToken;
    }
}
