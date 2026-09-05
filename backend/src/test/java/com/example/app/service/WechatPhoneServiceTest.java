package com.example.app.service;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.example.app.common.BizException;
import com.example.app.entity.User;
import com.example.app.mapper.UserMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.http.HttpMethod;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class WechatPhoneServiceTest {
    private final UserMapper mapper = mock(UserMapper.class);

    private WechatPhoneService service(String response) {
        com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(
                new org.apache.ibatis.builder.MapperBuilderAssistant(
                        new com.baomidou.mybatisplus.core.MybatisConfiguration(), "phone-test"), User.class);
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=test-token"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Content-Length", "21"))
                .andExpect(header("Content-Type", "application/json"))
                .andExpect(content().json("{\"code\":\"phone-code\"}"))
                .andRespond(withSuccess(response, MediaType.TEXT_PLAIN));
        WechatMiniCodeService credentials = mock(WechatMiniCodeService.class);
        when(credentials.token()).thenReturn("test-token");
        WechatPhoneService service = new WechatPhoneService(builder.build(), new ObjectMapper(), credentials, mapper);
        ReflectionTestUtils.setField(service, "appid", "test-app");
        return service;
    }

    @Test
    void savesVerifiedPhoneForCurrentUser() {
        when(mapper.update(isNull(), any(Wrapper.class))).thenReturn(1);
        User user = new User();
        user.setId(42L);
        var result = service("{\"errcode\":0,\"phone_info\":{\"purePhoneNumber\":\"13800138000\",\"countryCode\":\"86\",\"watermark\":{\"appid\":\"test-app\"}}}")
                .authorize(user, "phone-code");
        assertEquals("13800138000", result.get("phone"));
        verify(mapper).update(isNull(), argThat((Wrapper<User> wrapper) ->
                wrapper.getSqlSegment().contains("id")
                && ((com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<User>) wrapper)
                    .getParamNameValuePairs().containsValue(42L)));
    }

    @Test
    void failuresNeverWritePhone() {
        User user = new User();
        user.setId(42L);
        for (String response : new String[]{"not-json", "{\"errcode\":40029}", "{\"errcode\":0}",
                "{\"errcode\":0,\"phone_info\":{\"purePhoneNumber\":\"13800138000\",\"countryCode\":\"86\",\"watermark\":{\"appid\":\"other-app\"}}}"}) {
            assertThrows(BizException.class, () -> service(response).authorize(user, "phone-code"));
        }
        verifyNoInteractions(mapper);
    }
}
