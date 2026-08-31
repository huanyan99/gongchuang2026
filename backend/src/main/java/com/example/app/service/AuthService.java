package com.example.app.service;

import com.example.app.dto.LoginRequest;
import com.example.app.entity.User;
import com.example.app.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserMapper userMapper;

    /** 在 application.yml 中配置，或用环境变量覆盖 */
    @Value("${wechat.appid}")
    private String appid;
    @Value("${wechat.secret}")
    private String secret;

    @SuppressWarnings("unchecked")
    public User login(LoginRequest req) {
        String url = "https://api.weixin.qq.com/sns/jscode2session"
                + "?appid=" + appid
                + "&secret=" + secret
                + "&js_code=" + req.getCode()
                + "&grant_type=authorization_code";

        RestClient client = RestClient.create();
        Map<String, Object> resp = client.get().uri(url).retrieve().body(Map.class);

        if (resp == null || resp.get("openid") == null) {
            throw new IllegalArgumentException("微信登录失败: " + (resp == null ? "空响应" : resp.get("errmsg")));
        }
        String openid = (String) resp.get("openid");

        User user = userMapper.selectByOpenid(openid);
        if (user == null) {
            user = new User();
            user.setOpenid(openid);
            user.setNickname(req.getNickname());
            user.setAvatarUrl(req.getAvatarUrl());
            userMapper.insert(user);
        }
        return user;
    }

    /** 简易 token；生产环境建议换成 JWT 并入库/Redis 管理 */
    public String issueToken(User user) {
        return UUID.randomUUID().toString().replace("-", "");
    }
}
