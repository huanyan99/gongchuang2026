package com.example.app.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.example.app.entity.EventWeather;
import com.example.app.mapper.EventWeatherMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.zip.GZIPInputStream;

@Slf4j
@Service
@RequiredArgsConstructor
public class EventWeatherService {
    private final EventWeatherMapper mapper;
    private final RestClient wxRestClient;
    private final ObjectMapper objectMapper;

    @Value("${weather.qweather.enabled:false}") private boolean enabled;
    @Value("${weather.qweather.host:}") private String host;
    @Value("${weather.qweather.api-key:}") private String apiKey;

    public List<EventWeather> list() {
        return mapper.selectList(new LambdaQueryWrapper<EventWeather>()
                .orderByAsc(EventWeather::getEventDate));
    }

    @Scheduled(cron = "${weather.qweather.cron:0 15 */3 * * *}")
    public void scheduledRefresh() {
        if (!enabled || host.isBlank() || apiKey.isBlank()) return;
        list().forEach(this::refreshOneSafely);
    }

    @EventListener(ApplicationReadyEvent.class)
    public void refreshOnStartup() {
        scheduledRefresh();
    }

    private void refreshOneSafely(EventWeather event) {
        long days = ChronoUnit.DAYS.between(LocalDate.now(), event.getEventDate());
        if (days < 0 || event.getLocationId() == null || event.getLocationId().isBlank()) return;
        try {
            byte[] response = wxRestClient.get()
                    .uri(normalizeHost(host) + "/v7/weather/30d?location="
                            + event.getLocationId()
                            + "&lang=zh&unit=m")
                    .header("X-QW-Api-Key", apiKey)
                    .header("Accept-Encoding", "identity")
                    .retrieve().body(byte[].class);
            Map<String, Object> body = decodeResponse(response);
            applyForecast(event, body);
        } catch (Exception e) {
            log.warn("天气同步失败 city={}: {}", event.getCity(), e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    @Transactional
    protected void applyForecast(EventWeather event, Map<String, Object> body) {
        if (body == null || !"200".equals(String.valueOf(body.get("code")))
                || !(body.get("daily") instanceof List<?> daily)) return;
        Map<String, Object> target = daily.stream()
                .filter(Map.class::isInstance).map(item -> (Map<String, Object>) item)
                .filter(item -> event.getEventDate().toString().equals(String.valueOf(item.get("fxDate"))))
                .findFirst().orElse(null);
        if (target == null) {
            mapper.update(null, new LambdaUpdateWrapper<EventWeather>()
                    .eq(EventWeather::getId, event.getId())
                    .set(EventWeather::getTempMin, null)
                    .set(EventWeather::getTempMax, null)
                    .set(EventWeather::getWeatherText, null)
                    .set(EventWeather::getIcon, null)
                    .set(EventWeather::getTip, "临近活动日期将自动更新天气")
                    .set(EventWeather::getUpdatedAt, null));
            return;
        }
        event.setTempMin(Integer.valueOf(String.valueOf(target.get("tempMin"))));
        event.setTempMax(Integer.valueOf(String.valueOf(target.get("tempMax"))));
        event.setWeatherText(String.valueOf(target.get("textDay")));
        event.setIcon(toIcon(event.getWeatherText()));
        event.setTip(toTip(event.getWeatherText()));
        event.setUpdatedAt(LocalDateTime.now());
        mapper.updateById(event);
    }

    private static String normalizeHost(String value) {
        String result = value.trim();
        if (!result.startsWith("http://") && !result.startsWith("https://")) result = "https://" + result;
        return result.endsWith("/") ? result.substring(0, result.length() - 1) : result;
    }

    private Map<String, Object> decodeResponse(byte[] response) throws IOException {
        if (response == null || response.length == 0) return Map.of();
        byte[] json = response;
        if (response.length >= 2 && response[0] == (byte) 0x1f && response[1] == (byte) 0x8b) {
            try (GZIPInputStream gzip = new GZIPInputStream(new ByteArrayInputStream(response))) {
                json = gzip.readAllBytes();
            }
        }
        return objectMapper.readValue(json, new TypeReference<>() {});
    }

    private static String toIcon(String text) {
        if (text != null && text.contains("雨")) return "rainy";
        if (text != null && (text.contains("云") || text.contains("阴"))) return "cloudy";
        return "sunny";
    }

    private static String toTip(String text) {
        if (text != null && text.contains("雨")) return "请备好雨具，预留抵达时间";
        return "请关注温差，合理安排出行";
    }
}
