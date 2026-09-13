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

    /** 是否对普通嘉宾也执行「一个账号一台设备」限制；邀请人始终限制 */
    public static final String DEVICE_BINDING_GUESTS = "device_binding_guests";

    private final SettingMapper settingMapper;

    public boolean isEnabled(String key) {
        Setting setting = settingMapper.selectById(key);
        return setting != null && "true".equalsIgnoreCase(setting.getSettingValue());
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
        body.put(DEVICE_BINDING_GUESTS, isEnabled(DEVICE_BINDING_GUESTS));
        return body;
    }
}
