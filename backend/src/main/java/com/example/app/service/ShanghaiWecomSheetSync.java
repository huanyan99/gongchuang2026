package com.example.app.service;

import com.example.app.dto.AttendeeExportRow;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** Best-effort mirror. No registration, review or check-in request waits for this job. */
@Slf4j
@Service
public class ShanghaiWecomSheetSync {
    private static final class SyncFailure extends RuntimeException {
        SyncFailure(String detail) { super(detail); }
    }
    private static final String DOC_ID = "dcjUWPW999FKXmTp7h-WECFzCkYGCsJF_lDWBA62NHdmDjOFky6-JDhRQFDB18jSeCuImDADymE_kLSralOCeo9Q";
    private static final String SHEET_TITLE = "上海登记同步";
    private static final int WRITE_BATCH_SIZE = 50;
    private static final List<String> COLUMNS = List.of("同步编号", "登记编号", "参会人编号", "登记身份", "主联系人", "主联系人手机号", "场次", "桌号", "姓名", "性别", "手机号", "公司", "职位", "住宿要求", "房型", "入住日期", "审核状态", "申请原因", "审核备注", "审核时间", "修改次数", "邀请码", "提交时间", "入场核验状态", "入场核验时间", "签到状态", "签到次数", "首次签到时间", "最近签到时间");

    private final ApplicationService applications;
    private final ObjectMapper json;
    private final AtomicBoolean running = new AtomicBoolean();
    private final ExecutorService worker = Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "shanghai-wecom-sheet-sync");
        thread.setDaemon(true);
        thread.setPriority(Thread.MIN_PRIORITY);
        return thread;
    });

    @Value("${wecom.sheet.enabled:false}") private boolean enabled;
    @Value("${wecom.sheet.corp-id:}") private String corpId;
    @Value("${wecom.sheet.app-secret:}") private String appSecret;
    @Value("${wecom.sheet.sheet-id:}") private String configuredSheetId;

    // Dedicated short timeouts: a slow WeCom API cannot occupy application request threads.
    private final RestClient client;

    @Autowired
    public ShanghaiWecomSheetSync(ApplicationService applications, ObjectMapper json) {
        this(applications, json, createClient());
    }

    ShanghaiWecomSheetSync(ApplicationService applications, ObjectMapper json, RestClient client) {
        this.applications = applications;
        this.json = json;
        this.client = client;
    }

    private static RestClient createClient() {
        var factory = new org.springframework.http.client.SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(3));
        factory.setReadTimeout(Duration.ofSeconds(5));
        return RestClient.builder().requestFactory(factory).build();
    }

    @Scheduled(initialDelayString = "${wecom.sheet.initial-delay-ms:60000}", fixedDelayString = "${wecom.sheet.interval-ms:300000}")
    public void schedule() {
        if (!enabled || corpId.isBlank() || appSecret.isBlank() || !running.compareAndSet(false, true)) return;
        worker.execute(() -> {
            try { sync(); }
            catch (Exception ex) {
                // RestClient 原始异常可能含 access_token 或 corpsecret URL；仅记录我们构造的安全信息。
                StackTraceElement location = ex.getStackTrace().length == 0 ? null : ex.getStackTrace()[0];
                log.error("上海智能表格同步失败: detail={}, type={}, location={}",
                        ex instanceof SyncFailure || ex instanceof IllegalStateException
                                ? ex.getMessage() : ex.getClass().getSimpleName(),
                        ex.getClass().getSimpleName(), location);
            }
            finally { running.set(false); }
        });
    }

    @PreDestroy
    public void close() { worker.shutdownNow(); }

    void sync() throws Exception {
        long startedAt = System.nanoTime();
        log.info("上海智能表格同步开始");
        String token = token();
        String sheetId = configuredSheetId.isBlank() ? findOrCreateSheet(token) : configuredSheetId;
        ensureColumns(token, sheetId);
        Map<String, JsonNode> existing = existingRecords(token, sheetId);
        Set<String> currentKeys = new HashSet<>();
        long cursor = 0;
        int total = 0;
        int addedCount = 0;
        int updatedCount = 0;
        while (true) {
          List<AttendeeExportRow> rows;
          try { rows = applications.exportAttendeePage("上海", "", cursor, 500); }
          catch (Exception ex) { throw new SyncFailure("read_attendee_page cursor=" + cursor + " type=" + ex.getClass().getSimpleName()); }
          List<Map<String, Object>> additions = new ArrayList<>();
          List<Map<String, Object>> updates = new ArrayList<>();
          for (AttendeeExportRow row : rows) {
            String key = row.getApplicationId() + ":" + row.getGuestId();
            currentKeys.add(key);
            Map<String, Object> values = values(row, key);
            JsonNode old = existing.get(key);
            String recordId = old == null ? null : old.path("record_id").asText("");
            if (old != null && sameValues(old.path("values"), values)) continue;
            Map<String, Object> record = new LinkedHashMap<>();
            if (recordId != null && !recordId.isBlank()) record.put("record_id", recordId);
            record.put("values", values);
            (recordId == null || recordId.isBlank() ? additions : updates).add(record);
          }
          writeBatches(token, sheetId, "add_records", additions);
          writeBatches(token, sheetId, "update_records", updates);
          addedCount += additions.size();
          updatedCount += updates.size();
          total += rows.size();
          if (rows.size() < 500) break;
          cursor = rows.get(rows.size() - 1).getGuestId();
        }
        List<String> staleIds = new ArrayList<>();
        for (var entry : existing.entrySet()) {
            if (!currentKeys.contains(entry.getKey())) staleIds.add(entry.getValue().path("record_id").asText());
        }
        for (int start = 0; start < staleIds.size(); start += WRITE_BATCH_SIZE) {
            try {
                post(token, "delete_records", Map.of("docid", DOC_ID, "sheet_id", sheetId,
                        "record_ids", staleIds.subList(start, Math.min(start + WRITE_BATCH_SIZE, staleIds.size()))));
            } catch (Exception ex) {
                throw new SyncFailure("delete_records batch=" + (start / WRITE_BATCH_SIZE + 1)
                        + " size=" + Math.min(WRITE_BATCH_SIZE, staleIds.size() - start)
                        + " detail=" + safeDetail(ex));
            }
        }
        log.info("上海智能表格同步完成，参会人 {} 条，新增 {} 条，更新 {} 条，删除 {} 条，耗时 {} ms",
                total, addedCount, updatedCount, staleIds.size(), (System.nanoTime() - startedAt) / 1_000_000);
    }

    private void writeBatches(String token, String sheetId, String action, List<Map<String, Object>> records) throws Exception {
        for (int start = 0; start < records.size(); start += WRITE_BATCH_SIZE) {
            try {
                post(token, action, Map.of("docid", DOC_ID, "sheet_id", sheetId,
                        "key_type", "CELL_VALUE_KEY_TYPE_FIELD_TITLE",
                        "records", records.subList(start, Math.min(start + WRITE_BATCH_SIZE, records.size()))));
            } catch (Exception ex) {
                throw new SyncFailure(action + " batch=" + (start / WRITE_BATCH_SIZE + 1)
                        + " size=" + Math.min(WRITE_BATCH_SIZE, records.size() - start)
                        + " detail=" + safeDetail(ex));
            }
        }
    }

    private static String safeDetail(Exception ex) {
        return ex instanceof SyncFailure || ex instanceof IllegalStateException
                ? ex.getMessage() : ex.getClass().getSimpleName();
    }

    private String token() throws Exception {
        JsonNode result;
        try {
            result = json.readTree(client.get().uri("https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid={id}&corpsecret={secret}", corpId, appSecret)
                    .retrieve().body(String.class));
        } catch (RestClientResponseException ex) {
            throw new SyncFailure("gettoken http_status=" + ex.getStatusCode().value());
        } catch (RestClientException ex) {
            throw new SyncFailure("gettoken network_type=" + ex.getClass().getSimpleName());
        } catch (Exception ex) {
            throw new SyncFailure("gettoken response_type=" + ex.getClass().getSimpleName());
        }
        check(result, "gettoken");
        String accessToken = result.path("access_token").asText("");
        if (accessToken.isBlank()) throw new SyncFailure("gettoken missing access_token");
        return accessToken;
    }

    private String findOrCreateSheet(String token) throws Exception {
        JsonNode result = post(token, "get_sheet", Map.of("docid", DOC_ID));
        String found = findSheetId(result);
        if (!found.isBlank()) return found;
        post(token, "add_sheet", Map.of("docid", DOC_ID, "properties", Map.of("title", SHEET_TITLE)));
        found = findSheetId(post(token, "get_sheet", Map.of("docid", DOC_ID)));
        if (found.isBlank()) throw new IllegalStateException("add_sheet succeeded but sheet is not visible");
        return found;
    }

    private static String findSheetId(JsonNode result) {
        JsonNode sheets = result.path("sheet_list");
        if (!sheets.isArray()) throw new IllegalStateException("get_sheet did not return sheet_list");
        for (JsonNode sheet : sheets) {
            if (SHEET_TITLE.equals(sheet.path("title").asText()) || SHEET_TITLE.equals(sheet.path("properties").path("title").asText()))
                return sheet.path("sheet_id").asText();
        }
        return "";
    }

    private void ensureColumns(String token, String sheetId) throws Exception {
        List<JsonNode> fields = new ArrayList<>();
        int offset = 0;
        while (true) {
            JsonNode result = post(token, "get_fields", Map.of("docid", DOC_ID, "sheet_id", sheetId, "offset", offset, "limit", 100));
            JsonNode page = result.path("fields");
            if (!page.isArray()) throw new IllegalStateException("get_fields did not return fields");
            page.forEach(fields::add);
            if (!result.path("has_more").asBoolean(false)) break;
            int next = result.path("next").asInt(-1);
            if (next <= offset) throw new IllegalStateException("get_fields pagination offset missing");
            offset = next;
        }
        List<Map<String, String>> missing = new ArrayList<>();
        for (String column : COLUMNS) {
            boolean found = false;
            for (JsonNode field : fields) if (column.equals(field.path("field_title").asText())) { found = true; break; }
            if (!found) missing.add(Map.of("field_title", column, "field_type", "FIELD_TYPE_TEXT"));
        }
        for (int start = 0; start < missing.size(); start += 10)
            post(token, "add_fields", Map.of("docid", DOC_ID, "sheet_id", sheetId,
                    "fields", missing.subList(start, Math.min(start + 10, missing.size()))));
    }

    private Map<String, JsonNode> existingRecords(String token, String sheetId) throws Exception {
        Map<String, JsonNode> ids = new HashMap<>();
        int offset = 0;
        do {
            Map<String, Object> body = new HashMap<>(Map.of("docid", DOC_ID, "sheet_id", sheetId, "key_type", "CELL_VALUE_KEY_TYPE_FIELD_TITLE", "limit", 1000, "offset", offset));
            JsonNode page = post(token, "get_records", body);
            JsonNode records = page.path("records");
            if (!records.isArray()) throw new IllegalStateException("get_records did not return records");
            for (JsonNode record : records) {
                String key = record.path("values").path("同步编号").path(0).path("text").asText("");
                String id = record.path("record_id").asText("");
                if (!key.isBlank() && !id.isBlank()) ids.put(key, record);
            }
            if (!page.path("has_more").asBoolean(false)) break;
            int next = page.path("next").asInt(-1);
            if (next <= offset) throw new IllegalStateException("get_records pagination offset missing");
            offset = next;
        } while (true);
        return ids;
    }

    private static boolean sameValues(JsonNode previous, Map<String, Object> current) {
        for (var entry : current.entrySet()) {
            String text = ((Map<?, ?>) ((List<?>) entry.getValue()).get(0)).get("text").toString();
            if (!text.equals(previous.path(entry.getKey()).path(0).path("text").asText())) return false;
        }
        return true;
    }

    private JsonNode post(String token, String action, Object body) throws Exception {
        JsonNode result;
        try {
            result = json.readTree(client.post().uri("https://qyapi.weixin.qq.com/cgi-bin/wedoc/smartsheet/" + action + "?access_token={token}", token)
                    .body(body).retrieve().body(String.class));
        } catch (RestClientResponseException ex) {
            throw new SyncFailure(action + " http_status=" + ex.getStatusCode().value());
        } catch (RestClientException ex) {
            throw new SyncFailure(action + " network_type=" + ex.getClass().getSimpleName());
        } catch (Exception ex) {
            throw new SyncFailure(action + " response_type=" + ex.getClass().getSimpleName());
        }
        check(result, action);
        return result;
    }

    private static void check(JsonNode result, String action) {
        if (result == null || result.path("errcode").asInt(-1) != 0)
            throw new SyncFailure(action + " errcode=" + (result == null ? "empty" : result.path("errcode").asText()));
    }

    private static Map<String, Object> values(AttendeeExportRow r, String key) {
        String[] data = {key, str(r.getApplicationId()), str(r.getGuestId()), r.getRegistrationRole(), r.getContactName(), r.getContactPhone(), r.getEventCity(), r.getTableNo(), r.getName(), r.getGender(), r.getPhone(), r.getCompany(), r.getPosition(), r.getAccommodation(), r.getRoomType(), str(r.getCheckinDate()), status(r.getStatus()), r.getReason(), r.getReviewRemark(), str(r.getReviewedAt()), str(r.getEditCount()), r.getInvitationCode(), str(r.getCreatedAt()), r.getCheckedInAt() == null ? "未核验" : "已核验", str(r.getCheckedInAt()), r.getAttendanceCount() == null || r.getAttendanceCount() == 0 ? "未签到" : "已签到", str(r.getAttendanceCount()), str(r.getFirstAttendanceAt()), str(r.getLastAttendanceAt())};
        Map<String, Object> result = new LinkedHashMap<>();
        for (int i = 0; i < COLUMNS.size(); i++) result.put(COLUMNS.get(i), List.of(Map.of("type", "text", "text", str(data[i]))));
        return result;
    }

    private static String str(Object value) { return value == null ? "" : value.toString(); }
    private static String status(String value) { return switch (str(value)) { case "PENDING" -> "待审核"; case "APPROVED" -> "已通过"; case "REJECTED" -> "已驳回"; default -> str(value); }; }
}
