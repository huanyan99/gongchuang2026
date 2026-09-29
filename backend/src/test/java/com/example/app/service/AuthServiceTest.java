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

    @Test
    void concurrentFirstLoginOnSecondDeviceIsRejected() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://api.weixin.qq.com/sns/jscode2session?appid=test-app&secret=test-secret&js_code=test-code&grant_type=authorization_code"))
                .andRespond(withSuccess("{\"openid\":\"race-openid\"}", MediaType.APPLICATION_JSON));
        UserMapper mapper = mock(UserMapper.class);
        User existing = new User();
        existing.setId(1L);                       // 两台设备都读到 device_id 为空
        when(mapper.selectOne(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class))).thenReturn(existing);
        when(mapper.bindDeviceIfEmpty(1L, "device-B")).thenReturn(0);   // 数据库判定另一台先绑成功
        User winner = new User();
        winner.setId(1L);
        winner.setDeviceId("device-A");
        when(mapper.selectById(1L)).thenReturn(winner);
        SettingService settings = mock(SettingService.class);
        when(settings.isEnabled(anyString(), anyBoolean())).thenReturn(true);
        AuthService service = new AuthService(mapper,
                mock(com.example.app.mapper.ApplicationGuestMapper.class), builder.build(), new ObjectMapper(), settings);
        ReflectionTestUtils.setField(service, "appid", "test-app");
        ReflectionTestUtils.setField(service, "secret", "test-secret");

        LoginRequest request = new LoginRequest();
        request.setCode("test-code");
        BizException error = assertThrows(BizException.class, () -> service.login(request, "device-B"));
        assertTrue(error.getMessage().contains("已绑定其他设备"));
        // 关键：被抢先后不得签发 token（也就不会把设备字段整行写回去）
        verify(mapper, never()).updateById(any(User.class));
    }

    @Test
    void firstLoginBindsDeviceThroughConditionalUpdate() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://api.weixin.qq.com/sns/jscode2session?appid=test-app&secret=test-secret&js_code=test-code&grant_type=authorization_code"))
                .andRespond(withSuccess("{\"openid\":\"first-openid\"}", MediaType.APPLICATION_JSON));
        UserMapper mapper = mock(UserMapper.class);
        User existing = new User();
        existing.setId(1L);
        when(mapper.selectOne(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class))).thenReturn(existing);
        when(mapper.bindDeviceIfEmpty(1L, "device-A")).thenReturn(1);
        SettingService settings = mock(SettingService.class);
        when(settings.isEnabled(anyString(), anyBoolean())).thenReturn(true);
        AuthService service = new AuthService(mapper,
                mock(com.example.app.mapper.ApplicationGuestMapper.class), builder.build(), new ObjectMapper(), settings);
        ReflectionTestUtils.setField(service, "appid", "test-app");
        ReflectionTestUtils.setField(service, "secret", "test-secret");

        LoginRequest request = new LoginRequest();
        request.setCode("test-code");
        User user = service.login(request, "device-A");

        assertEquals("device-A", user.getDeviceId());
        assertNotNull(user.getToken());
        verify(mapper).bindDeviceIfEmpty(1L, "device-A");
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
