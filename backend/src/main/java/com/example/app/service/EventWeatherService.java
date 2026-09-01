package com.example.app.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.example.app.entity.EventWeather;
import com.example.app.mapper.EventWeatherMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class EventWeatherService {
    private final EventWeatherMapper mapper;
    private final RestClient wxRestClient;

    @Value("${weather.qweather.enabled:false}") private boolean enabled;
    @Value("${weather.qweather.host:}") private String host;
    @Value("${weather.qweather.key:}") private String key;

    public List<EventWeather> list() {
        return mapper.selectList(new LambdaQueryWrapper<EventWeather>()
                .orderByAsc(EventWeather::getEventDate));
    }

    @Scheduled(cron = "${weather.qweather.cron:0 15 */3 * * *}")
    public void scheduledRefresh() {
        if (!enabled || host.isBlank() || key.isBlank()) return;
        list().forEach(this::refreshOneSafely);
    }

    private void refreshOneSafely(EventWeather event) {
        long days = ChronoUnit.DAYS.between(LocalDate.now(), event.getEventDate());
        if (days < 0 || days > 7 || event.getLocationId() == null || event.getLocationId().isBlank()) return;
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> body = wxRestClient.get()
                    .uri(host + "/v7/weather/7d?location=" + event.getLocationId() + "&key=" + key)
                    .retrieve().body(Map.class);
            applyForecast(event, body);
        } catch (Exception e) {
            log.warn("天气同步失败 city={}: {}", event.getCity(), e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    @Transactional
    protected void applyForecast(EventWeather event, Map<String, Object> body) {
        if (body == null || !"200".equals(String.valueOf(body.get("code")))) return;
        Object dailyValue = body.get("daily");
        if (!(dailyValue instanceof List<?> daily)) return;
        Map<String, Object> target = daily.stream()
                .filter(Map.class::isInstance).map(item -> (Map<String, Object>) item)
                .filter(item -> event.getEventDate().toString().equals(String.valueOf(item.get("fxDate"))))
                .findFirst().orElse(null);
        if (target == null) return;
        event.setTempMin(Integer.valueOf(String.valueOf(target.get("tempMin"))));
        event.setTempMax(Integer.valueOf(String.valueOf(target.get("tempMax"))));
        event.setWeatherText(String.valueOf(target.get("textDay")));
        event.setIcon(toIcon(event.getWeatherText()));
        event.setTip(toTip(event.getWeatherText()));
        event.setUpdatedAt(LocalDateTime.now());
        mapper.updateById(event);
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
