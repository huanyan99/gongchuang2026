package com.example.app.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.example.app.common.ApplyStatus;
import com.example.app.common.BizException;
import com.example.app.common.ErrorCode;
import com.example.app.entity.Application;
import com.example.app.entity.ApplicationGuest;
import com.example.app.entity.Seat;
import com.example.app.entity.User;
import com.example.app.mapper.SeatMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 桌位安排。
 * 嘉宾端只返回自己的桌号与各桌人数，不下发其他嘉宾的姓名和手机号。
 */
@Service
@RequiredArgsConstructor
public class SeatService {

    /** 单次导入上限，避免一次请求写入过多数据 */
    public static final int MAX_IMPORT_ROWS = 2000;

    private static final Pattern PHONE = Pattern.compile("^1\\d{10}$");

    private final SeatMapper seatMapper;
    private final ApplicationService applicationService;
    private final InvitationService invitationService;

    /** 当前登录嘉宾的桌位与本场桌位图 */
    public Map<String, Object> mySeat(User user) {
        Application application = applicationService.findForAttendee(user);
        if (application == null) {
            throw new BizException(ErrorCode.APPLY_NOT_FOUND);
        }
        if (!ApplyStatus.APPROVED.name().equals(application.getStatus())) {
            throw new BizException(ErrorCode.SEAT_NOT_APPROVED);
        }

        String eventCity = invitationService.getByCode(application.getInvitationCode()).getEventCity();
        List<Seat> citySeats = listByCity(eventCity);

        Set<String> myPhones = new LinkedHashSet<>();
        if (application.getPhone() != null) myPhones.add(application.getPhone());
        for (ApplicationGuest guest : applicationService.loadGuests(application.getId())) {
            if (guest.getPhone() != null) myPhones.add(guest.getPhone());
        }

        // 只返回本人及同行人的桌号，不下发其他嘉宾信息，也不下发同桌人数
        List<Map<String, Object>> mySeats = new ArrayList<>();
        for (Seat seat : citySeats) {
            if (!myPhones.contains(seat.getPhone())) continue;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("name", seat.getName());
            row.put("tableNo", seat.getTableNo());
            mySeats.add(row);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("eventCity", eventCity);
        body.put("published", !citySeats.isEmpty());
        body.put("mySeats", mySeats);
        return body;
    }

    /** 批量导入；逐行校验，单行不合法只跳过该行并回传行号 */
    @Transactional
    public Map<String, Object> importSeats(String eventCity, String mode, List<Seat> rows) {
        String city = trim(eventCity);
        if (city.isEmpty()) {
            throw new BizException(ErrorCode.BAD_REQUEST, "缺少活动场次");
        }
        if (rows == null || rows.isEmpty()) {
            throw new BizException(ErrorCode.BAD_REQUEST, "没有可导入的桌位数据");
        }
        if (rows.size() > MAX_IMPORT_ROWS) {
            throw new BizException(ErrorCode.BAD_REQUEST, "单次最多导入 " + MAX_IMPORT_ROWS + " 条");
        }

        boolean replace = "REPLACE".equalsIgnoreCase(mode);
        if (replace) {
            seatMapper.delete(new LambdaQueryWrapper<Seat>().eq(Seat::getEventCity, city));
        }

        Map<String, Seat> existing = new LinkedHashMap<>();
        for (Seat seat : listByCity(city)) {
            existing.put(seat.getPhone(), seat);
        }

        List<Map<String, Object>> errors = new ArrayList<>();
        Set<String> batchPhones = new LinkedHashSet<>();
        int created = 0;
        int updated = 0;

        for (int i = 0; i < rows.size(); i++) {
            Seat row = rows.get(i);
            int line = i + 1;
            String name = trim(row.getName());
            String phone = trim(row.getPhone());
            String tableNo = trim(row.getTableNo());

            if (name.isEmpty() || phone.isEmpty() || tableNo.isEmpty()) {
                errors.add(error(line, "姓名、手机号、桌号不能为空"));
                continue;
            }
            if (!PHONE.matcher(phone).matches()) {
                errors.add(error(line, "手机号格式不正确"));
                continue;
            }
            if (name.length() > 64 || tableNo.length() > 32) {
                errors.add(error(line, "姓名或桌号超出长度限制"));
                continue;
            }
            if (!batchPhones.add(phone)) {
                errors.add(error(line, "同一手机号在本次导入中重复"));
                continue;
            }

            Seat target = existing.get(phone);
            LocalDateTime now = LocalDateTime.now();
            if (target == null) {
                Seat entity = new Seat();
                entity.setEventCity(city);
                entity.setName(name);
                entity.setPhone(phone);
                entity.setTableNo(tableNo);
                entity.setRemark(emptyToNull(trim(row.getRemark())));
                entity.setCreatedAt(now);
                entity.setUpdatedAt(now);
                seatMapper.insert(entity);
                existing.put(phone, entity);
                created += 1;
            } else {
                target.setName(name);
                target.setTableNo(tableNo);
                target.setRemark(emptyToNull(trim(row.getRemark())));
                target.setUpdatedAt(now);
                seatMapper.updateById(target);
                updated += 1;
            }
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("eventCity", city);
        body.put("mode", replace ? "REPLACE" : "MERGE");
        body.put("total", rows.size());
        body.put("created", created);
        body.put("updated", updated);
        body.put("failed", errors.size());
        body.put("errors", errors.size() > 20 ? errors.subList(0, 20) : errors);
        body.putAll(summary(city));
        return body;
    }

    /** 管理端分页查看某场次的桌位 */
    public Map<String, Object> page(String eventCity, long pageNo, long size) {
        String city = trim(eventCity);
        LambdaQueryWrapper<Seat> query = new LambdaQueryWrapper<Seat>()
                .eq(!city.isEmpty(), Seat::getEventCity, city)
                .orderByDesc(Seat::getId);
        Page<Seat> result = seatMapper.selectPage(Page.of(pageNo, size), query);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("records", result.getRecords());
        body.put("total", result.getTotal());
        body.put("page", result.getCurrent());
        body.put("size", result.getSize());
        body.put("pages", result.getPages());
        body.putAll(summary(city));
        return body;
    }

    /** 某场次的桌数与就座人数 */
    public Map<String, Object> summary(String eventCity) {
        List<Seat> seats = listByCity(trim(eventCity));
        Set<String> tables = new LinkedHashSet<>();
        seats.forEach((seat) -> tables.add(seat.getTableNo()));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("tableCount", tables.size());
        body.put("guestCount", seats.size());
        return body;
    }

    private List<Seat> listByCity(String eventCity) {
        if (eventCity == null || eventCity.isEmpty()) return List.of();
        return seatMapper.selectList(new LambdaQueryWrapper<Seat>()
                .eq(Seat::getEventCity, eventCity)
                .orderByAsc(Seat::getId));
    }

    private Map<String, Object> error(int line, String message) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("line", line);
        row.put("message", message);
        return row;
    }

    private String trim(String value) {
        return value == null ? "" : value.trim();
    }

    private String emptyToNull(String value) {
        return value.isEmpty() ? null : value;
    }
}
