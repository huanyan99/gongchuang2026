package com.example.app.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.app.common.BizException;
import com.example.app.common.ErrorCode;
import com.example.app.entity.User;
import com.example.app.mapper.UserMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;

import java.time.LocalDateTime;
import java.util.Map;

@Service
@Slf4j
@RequiredArgsConstructor
public class WechatPhoneService {
    private final RestClient wxRestClient;
    private final ObjectMapper objectMapper;
    private final WechatMiniCodeService credentials;
    private final UserMapper userMapper;
    @Value("${wechat.appid}") private String appid;

    public Map<String, String> authorize(User user, String code) {
        JsonNode response;
        try {
            String raw = wxRestClient.post()
                    .uri("https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=" + credentials.token())
                    // 预先序列化字节以发送 Content-Length，避免微信拒绝分块请求（HTTP 412）。
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(objectMapper.writeValueAsBytes(Map.of("code", code)))
                    .retrieve().body(String.class);
            response = objectMapper.readTree(raw);
        } catch (BizException e) {
            throw e;
        } catch (Exception e) {
            log.warn("微信手机号交换异常: type={}", e.getClass().getSimpleName());
            // 不将包含 access_token / 手机号 / 授权 code 的异常内容传给客户端或日志。
            throw new BizException(ErrorCode.WECHAT_API_ERROR, "手机号接口连接或解析失败，请重新点击登录（阶段：手机号交换）");
        }
        if (response == null || response.path("errcode").asInt(-1) != 0) {
            int wxCode = response == null ? -1 : response.path("errcode").asInt(-1);
            log.warn("微信手机号交换失败: errcode={}", wxCode);
            throw new BizException(ErrorCode.WECHAT_API_ERROR, "手机号授权失败，请重新点击登录（微信错误码：" + wxCode + "）");
        }
        JsonNode info = response.path("phone_info");
        String phone = info.path("purePhoneNumber").asText("");
        String country = info.path("countryCode").asText("");
        if (!appid.equals(info.path("watermark").path("appid").asText())
                || !phone.matches("[0-9]{5,20}") || !country.matches("[0-9]{1,5}")) {
            throw new BizException(ErrorCode.WECHAT_API_ERROR, "手机号授权数据校验失败，请重新授权");
        }
        int updated = userMapper.update(null, Wrappers.<User>lambdaUpdate()
                .eq(User::getId, user.getId()).set(User::getPhone, phone)
                .set(User::getPhoneCountryCode, country).set(User::getPhoneVerifiedAt, LocalDateTime.now()));
        if (updated != 1) throw new BizException(ErrorCode.UNAUTHORIZED);
        return Map.of("phone", phone, "phoneCountryCode", country);
    }
}
