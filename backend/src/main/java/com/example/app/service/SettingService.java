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
        Setting setting = new Setting();
        setting.setSettingKey(key);
        setting.setSettingValue(String.valueOf(enabled));
        setting.setUpdatedAt(LocalDateTime.now());
        if (settingMapper.selectById(key) == null) {
            settingMapper.insert(setting);
        } else {
            settingMapper.updateById(setting);
        }
    }

    /** 管理端读取全部开关 */
    public Map<String, Boolean> all() {
        Map<String, Boolean> body = new LinkedHashMap<>();
        body.put(DEVICE_BINDING_GUESTS, isEnabled(DEVICE_BINDING_GUESTS, false));
        body.put(DEVICE_BINDING_INVITERS, isEnabled(DEVICE_BINDING_INVITERS, true));
        return body;
    }
}
