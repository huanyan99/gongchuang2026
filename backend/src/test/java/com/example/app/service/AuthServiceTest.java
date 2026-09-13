package com.example.app.service;

import com.example.app.common.BizException;
import com.example.app.dto.LoginRequest;
import com.example.app.entity.User;
import com.example.app.mapper.UserMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestClient;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class AuthServiceTest {
    @Test
    void parsesWechatJsonForBothContentTypes() {
        for (MediaType type : new MediaType[]{MediaType.TEXT_PLAIN, MediaType.APPLICATION_JSON}) {
            AuthService service = serviceWithResponse("{\"openid\":\"test-openid\"}", type);
            LoginRequest request = new LoginRequest();
            request.setCode("test-code");
            User user = service.login(request);
            assertNotNull(user.getToken());
            assertNotNull(user.getTokenExpire());
        }
    }

    @Test
    void rejectsWechatErrorAndMalformedResponse() {
        for (String response : new String[]{"{\"errcode\":40029,\"errmsg\":\"invalid code\"}", "not-json"}) {
            AuthService service = serviceWithResponse(response, MediaType.TEXT_PLAIN);
            LoginRequest request = new LoginRequest();
            request.setCode("test-code");
            assertThrows(BizException.class, () -> service.login(request));
        }
    }

    private AuthService serviceWithResponse(String response, MediaType type) {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://api.weixin.qq.com/sns/jscode2session?appid=test-app&secret=test-secret&js_code=test-code&grant_type=authorization_code"))
                .andRespond(withSuccess(response, type));
        UserMapper mapper = mock(UserMapper.class);
        User existing = new User();
        existing.setId(1L);
        when(mapper.selectOne(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class))).thenReturn(existing);
        AuthService service = new AuthService(mapper,
                mock(com.example.app.mapper.ApplicationGuestMapper.class), builder.build(), new ObjectMapper(),
                mock(SettingService.class));
        ReflectionTestUtils.setField(service, "appid", "test-app");
        ReflectionTestUtils.setField(service, "secret", "test-secret");
        return service;
    }
}
