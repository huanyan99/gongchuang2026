package com.example.app.service;

import com.example.app.entity.Setting;
import com.example.app.mapper.SettingMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

/** 后台开关。读多写少，直接查库并按键返回默认值。 */
@Service
@RequiredArgsConstructor
public class SettingService {

    /** 是否对普通嘉宾执行「一个账号一台设备」限制，默认关闭 */
    public static final String DEVICE_BINDING_GUESTS = "device_binding_guests";

    /** 是否对邀请人执行「一个账号一台设备」限制，默认开启 */
    public static final String DEVICE_BINDING_INVITERS = "device_binding_inviters";

    public static final Map<String, String> LOTTERY_KEYS = Map.of(
            "佛山", "lottery_open_foshan", "济南", "lottery_open_jinan", "上海", "lottery_open_shanghai");

    /** 场次桌位图是否对嘉宾显示 */
    public static final Map<String, String> SEAT_VISIBLE_KEYS = Map.of(
            "佛山", "seat_visible_foshan", "济南", "seat_visible_jinan", "上海", "seat_visible_shanghai");

    /** 桌位图可见性默认值：与开关上线前的线上表现逐场一致 */
    private static final Map<String, Boolean> SEAT_VISIBLE_DEFAULTS = Map.of(
            "佛山", true, "济南", true, "上海", false);

    public boolean isLotteryOpen(String city) {
        String key = city == null ? null : LOTTERY_KEYS.get(city);
        return key != null && isEnabled(key, false);
    }

    /** 桌位图是否对该场次嘉宾开放；未配置的场次默认开放，避免新场次被误藏 */
    public boolean isSeatVisible(String eventCity) {
        String city = eventCity == null ? "" : eventCity.trim();
        String key = SEAT_VISIBLE_KEYS.get(city);
        if (key == null) return true;
        return isEnabled(key, SEAT_VISIBLE_DEFAULTS.getOrDefault(city, true));
    }

    private final SettingMapper settingMapper;

    public boolean isEnabled(String key) {
        return isEnabled(key, false);
    }

    /** 开关每次读库，后台改完即刻生效，不做进程内缓存 */
    public boolean isEnabled(String key, boolean defaultValue) {
        Setting setting = settingMapper.selectById(key);
        if (setting == null || setting.getSettingValue() == null) return defaultValue;
        return "true".equalsIgnoreCase(setting.getSettingValue());
    }

    public void setEnabled(String key, boolean enabled) {
        setEnabled(key, enabled, null);
    }

    /** 写入开关并记录操作人；用原子 upsert，避免两人同时改同一个开关时先查后写互相打断 */
    public void setEnabled(String key, boolean enabled, String updatedBy) {
        settingMapper.upsert(key, String.valueOf(enabled), updatedBy);
    }

    /** 管理端读取全部开关 */
    public Map<String, Boolean> all() {
        Map<String, Boolean> body = new LinkedHashMap<>();
        body.put(DEVICE_BINDING_GUESTS, isEnabled(DEVICE_BINDING_GUESTS, false));
        body.put(DEVICE_BINDING_INVITERS, isEnabled(DEVICE_BINDING_INVITERS, true));
        LOTTERY_KEYS.values().forEach(key -> body.put(key, isEnabled(key, false)));
        SEAT_VISIBLE_KEYS.forEach((city, key) -> body.put(key, isEnabled(key, SEAT_VISIBLE_DEFAULTS.getOrDefault(city, true))));
        return body;
    }
}
