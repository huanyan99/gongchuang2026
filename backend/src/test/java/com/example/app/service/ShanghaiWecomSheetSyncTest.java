package com.example.app.service;

import com.example.app.dto.AttendeeExportRow;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.http.HttpStatus.FORBIDDEN;

class ShanghaiWecomSheetSyncTest {
    private final ObjectMapper json = new ObjectMapper();
    private final ApplicationService applications = mock(ApplicationService.class);
    private final RestClient.Builder builder = RestClient.builder();
    private final MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    private final ShanghaiWecomSheetSync sync = new ShanghaiWecomSheetSync(applications, json, builder.build());

    @AfterEach void close() { sync.close(); }

    @Test void reportsHttpStageWithoutLoggingSecret() {
        ReflectionTestUtils.setField(sync, "corpId", "test-corp");
        ReflectionTestUtils.setField(sync, "appSecret", "sensitive-secret");
        server.expect(once(), requestTo(org.hamcrest.Matchers.containsString("/gettoken?")))
                .andRespond(withStatus(FORBIDDEN));
        Exception failure = assertThrows(Exception.class, sync::sync);
        assertTrue(failure.getMessage().contains("gettoken http_status=403"));
        assertFalse(failure.getMessage().contains("sensitive-secret"));
        server.verify();
    }

    @Test void createsDedicatedSheetWhenAbsent() throws Exception {
        ReflectionTestUtils.setField(sync, "configuredSheetId", "");
        ReflectionTestUtils.setField(sync, "corpId", "test-corp");
        ReflectionTestUtils.setField(sync, "appSecret", "test-secret");
        when(applications.exportAttendeePage("上海", "", 0, 500)).thenReturn(List.of());
        server.expect(once(), requestTo(org.hamcrest.Matchers.containsString("/gettoken?")))
                .andRespond(withSuccess("{\"errcode\":0,\"access_token\":\"test-token\"}", APPLICATION_JSON));
        server.expect(once(), requestTo(org.hamcrest.Matchers.containsString("/get_sheet?")))
                .andRespond(withSuccess("{\"errcode\":0,\"sheet_list\":[]}", APPLICATION_JSON));
        server.expect(once(), requestTo(org.hamcrest.Matchers.containsString("/add_sheet?")))
                .andExpect(content().json("{\"properties\":{\"title\":\"上海登记同步\"}}"))
                .andRespond(withSuccess("{\"errcode\":0}", APPLICATION_JSON));
        server.expect(once(), requestTo(org.hamcrest.Matchers.containsString("/get_sheet?")))
                .andRespond(withSuccess("{\"errcode\":0,\"sheet_list\":[{\"sheet_id\":\"sheet-1\",\"title\":\"上海登记同步\"}]}", APPLICATION_JSON));
        server.expect(once(), requestTo(org.hamcrest.Matchers.containsString("/get_fields?")))
                .andRespond(withSuccess("{\"errcode\":0,\"fields\":[],\"has_more\":false}", APPLICATION_JSON));
        for (int i = 0; i < 3; i++) server.expect(once(), requestTo(org.hamcrest.Matchers.containsString("/add_fields?")))
                .andRespond(withSuccess("{\"errcode\":0}", APPLICATION_JSON));
        server.expect(once(), requestTo(org.hamcrest.Matchers.containsString("/get_records?")))
                .andRespond(withSuccess("{\"errcode\":0,\"records\":[],\"has_more\":false}", APPLICATION_JSON));
        sync.sync();
        server.verify();
    }

    @Test void addsOnceSkipsUnchangedAndUpdatesAttendance() throws Exception {
        ReflectionTestUtils.setField(sync, "configuredSheetId", "sheet-1");
        ReflectionTestUtils.setField(sync, "corpId", "test-corp");
        ReflectionTestUtils.setField(sync, "appSecret", "test-secret");
        AttendeeExportRow row = new AttendeeExportRow();
        row.setApplicationId(12L); row.setGuestId(34L); row.setEventCity("上海");
        row.setName("测试嘉宾"); row.setStatus("PENDING"); row.setAttendanceCount(0L);
        when(applications.exportAttendeePage("上海", "", 0, 500)).thenReturn(List.of(row));
        AtomicReference<JsonNode> added = new AtomicReference<>();

        commonRequests();
        server.expect(once(), requestTo(org.hamcrest.Matchers.containsString("/get_records?")))
                .andRespond(withSuccess("{\"errcode\":0,\"records\":[],\"has_more\":false}", APPLICATION_JSON));
        server.expect(once(), requestTo(org.hamcrest.Matchers.containsString("/add_records?")))
                .andRespond(request -> {
                    added.set(json.readTree(((org.springframework.mock.http.client.MockClientHttpRequest) request).getBodyAsBytes()).path("records").path(0).path("values"));
                    return withSuccess("{\"errcode\":0,\"records\":[{\"record_id\":\"rec-1\"}]}", APPLICATION_JSON).createResponse(request);
                });
        sync.sync();
        server.verify();
        assertEquals("12:34", added.get().path("同步编号").path(0).path("text").asText());
        assertEquals("待审核", added.get().path("审核状态").path(0).path("text").asText());
        assertEquals("未签到", added.get().path("签到状态").path(0).path("text").asText());

        server.reset();
        commonRequests();
        existingRecord(added.get());
        sync.sync();
        server.verify(); // No add/update expectation: unchanged row must produce no write.

        server.reset();
        row.setStatus("APPROVED"); row.setAttendanceCount(2L);
        commonRequests();
        existingRecord(added.get());
        server.expect(once(), requestTo(org.hamcrest.Matchers.containsString("/update_records?")))
                .andRespond(request -> {
                    JsonNode record = json.readTree(((org.springframework.mock.http.client.MockClientHttpRequest) request).getBodyAsBytes()).path("records").path(0);
                    assertEquals("rec-1", record.path("record_id").asText());
                    assertEquals("已通过", record.path("values").path("审核状态").path(0).path("text").asText());
                    assertEquals("已签到", record.path("values").path("签到状态").path(0).path("text").asText());
                    assertEquals("2", record.path("values").path("签到次数").path(0).path("text").asText());
                    return withSuccess("{\"errcode\":0}", APPLICATION_JSON).createResponse(request);
                });
        sync.sync();
        server.verify();
    }

    @Test void removesRecordsNoLongerInShanghaiRegistration() throws Exception {
        ReflectionTestUtils.setField(sync, "configuredSheetId", "sheet-1");
        ReflectionTestUtils.setField(sync, "corpId", "test-corp");
        ReflectionTestUtils.setField(sync, "appSecret", "test-secret");
        when(applications.exportAttendeePage("上海", "", 0, 500)).thenReturn(List.of());
        commonRequests();
        server.expect(once(), requestTo(org.hamcrest.Matchers.containsString("/get_records?")))
                .andRespond(withSuccess("{\"errcode\":0,\"records\":[{\"record_id\":\"old-1\",\"values\":{\"同步编号\":[{\"text\":\"12:34\"}]}}],\"has_more\":false}", APPLICATION_JSON));
        server.expect(once(), requestTo(org.hamcrest.Matchers.containsString("/delete_records?")))
                .andExpect(content().json("{\"record_ids\":[\"old-1\"]}"))
                .andRespond(withSuccess("{\"errcode\":0}", APPLICATION_JSON));
        sync.sync();
        server.verify();
    }

    private void commonRequests() {
        server.expect(once(), requestTo(org.hamcrest.Matchers.containsString("/gettoken?")))
                .andRespond(withSuccess("{\"errcode\":0,\"access_token\":\"test-token\"}", APPLICATION_JSON));
        server.expect(once(), requestTo(org.hamcrest.Matchers.containsString("/get_fields?")))
                .andExpect(content().json("{\"offset\":0,\"limit\":100}"))
                .andRespond(withSuccess("{\"errcode\":0,\"has_more\":true,\"next\":10,\"fields\":[]}", APPLICATION_JSON));
        server.expect(once(), requestTo(org.hamcrest.Matchers.containsString("/get_fields?")))
                .andExpect(content().json("{\"offset\":10,\"limit\":100}"))
                .andRespond(withSuccess("{\"errcode\":0,\"has_more\":false,\"fields\":[]}", APPLICATION_JSON));
        // All columns are absent in this mock. They must be added in bounded batches.
        for (int i = 0; i < 3; i++) server.expect(once(), requestTo(org.hamcrest.Matchers.containsString("/add_fields?")))
                .andRespond(withSuccess("{\"errcode\":0}", APPLICATION_JSON));
    }

    private void existingRecord(JsonNode values) throws Exception {
        String body = json.writeValueAsString(java.util.Map.of("errcode", 0, "has_more", false,
                "records", List.of(java.util.Map.of("record_id", "rec-1", "values", values))));
        server.expect(once(), requestTo(org.hamcrest.Matchers.containsString("/get_records?")))
                .andRespond(withSuccess(body, APPLICATION_JSON));
    }
}
