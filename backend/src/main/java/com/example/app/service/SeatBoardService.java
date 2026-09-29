package com.example.app.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.example.app.common.BizException;
import com.example.app.common.ErrorCode;
import com.example.app.dto.SeatBoardPerson;
import com.example.app.dto.SeatBoardSaveRequest;
import com.example.app.entity.AdminUser;
import com.example.app.entity.Seat;
import com.example.app.entity.SeatRevision;
import com.example.app.entity.SeatTable;
import com.example.app.mapper.SeatBoardMapper;
import com.example.app.mapper.SeatMapper;
import com.example.app.mapper.SeatRevisionMapper;
import com.example.app.mapper.SeatTableMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 桌位分配看板。
 * 读取：左侧人员名单（审核通过的登记）+ 右侧桌位定义 + 场次版本号。
 * 保存：以场次为单位「全量替换」，靠场次锁 + 版本号保证多管理员并发下不互相覆盖。
 *
 * 不变量：
 * 1. 只有本场次审核通过的登记参会人能出现在名单里，也只有他们能被分配；
 * 2. 人坐哪桌记在 gonghcuang_seat.table_no（嘉宾端按此读取），桌位定义记在 gonghcuang_table；
 * 3. 姓名等一律以登记数据为准，不采信前端提交。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SeatBoardService {

    /** 场次锁名前缀，锁的粒度就是「场次」 */
    private static final String LOCK_PREFIX = "gch_seat:";

    /** 取锁最多等 3 秒，拿不到就当作并发冲突直接返回 */
    private static final int LOCK_TIMEOUT_SECONDS = 3;

    private final SeatTableMapper tableMapper;
    private final SeatRevisionMapper revisionMapper;
    private final SeatBoardMapper boardMapper;
    private final SeatMapper seatMapper;
    private final SettingService settingService;

    /** 看板数据；summaryOnly 只回统计（小程序后台用，避免拉整份名单） */
    public Map<String, Object> board(String eventCity, boolean summaryOnly) {
        String city = trim(eventCity);
        if (city.isEmpty()) {
            throw new BizException(ErrorCode.BAD_REQUEST, "缺少活动场次");
        }
        SeatRevision revision = revisionMapper.selectById(city);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("eventCity", city);
        body.put("revision", revision == null || revision.getRevision() == null ? 0L : revision.getRevision());
        body.put("updatedAt", revision == null ? null : revision.getUpdatedAt());
        body.put("updatedByName", revision == null ? null : revision.getUpdatedByName());
        body.put("orphanCount", boardMapper.countOrphanSeats(city));
        body.put("guestVisible", settingService.isSeatVisible(city));

        if (summaryOnly) {
            int peopleCount = boardMapper.countRoster(city);
            int assigned = boardMapper.countAssigned(city);
            Map<String, Object> summary = new LinkedHashMap<>();
            summary.put("tableCount", listTables(city).size());
            summary.put("peopleCount", peopleCount);
            summary.put("assigned", assigned);
            summary.put("unassigned", Math.max(0, peopleCount - assigned));
            body.put("summary", summary);
            return body;
        }

        List<SeatTable> tables = listTables(city);
        List<Map<String, Object>> tableRows = new ArrayList<>();
        for (SeatTable table : tables) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", table.getId());
            row.put("tableNo", table.getTableNo());
            row.put("capacity", table.getCapacity());
            row.put("sortNo", table.getSortNo());
            tableRows.add(row);
        }

        List<SeatBoardPerson> people = boardMapper.selectRoster(city);
        // 同名提醒：本场次出现两次以上的姓名。同名的人可能同公司、手机号后四位也相同，
        // 前端靠「角色 + 完整手机号」才能区分，所以这里先把标记算出来。
        Map<String, Integer> nameCounts = new LinkedHashMap<>();
        for (SeatBoardPerson person : people) {
            nameCounts.merge(person.getName() == null ? "" : person.getName(), 1, Integer::sum);
        }
        List<Map<String, Object>> personRows = new ArrayList<>();
        int assigned = 0;
        for (SeatBoardPerson person : people) {
            if (person.getTableNo() != null && !person.getTableNo().isEmpty()) assigned += 1;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("applicationId", person.getApplicationId());
            row.put("phone", person.getPhone());
            row.put("name", person.getName());
            row.put("company", person.getCompany());
            row.put("position", person.getPosition());
            row.put("contactPhone", person.getContactPhone());
            row.put("tableNo", person.getTableNo());
            row.put("role", person.getPhone() != null && person.getPhone().equals(person.getContactPhone())
                    ? "主联系人" : "同行人");
            row.put("duplicate", nameCounts.getOrDefault(person.getName() == null ? "" : person.getName(), 0) > 1);
            personRows.add(row);
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("tableCount", tables.size());
        summary.put("peopleCount", people.size());
        summary.put("assigned", assigned);
        summary.put("unassigned", people.size() - assigned);

        body.put("tables", tableRows);
        body.put("people", personRows);
        body.put("summary", summary);
        return body;
    }

    /**
     * 保存看板：提交的是「最终状态」。
     * 顺序固定为 ①版本校验 ②人员校验 ③桌位定义增删改 ④桌位行全量替换 ⑤版本号 +1。
     */
    @Transactional
    public Map<String, Object> save(SeatBoardSaveRequest req, AdminUser admin) {
        String city = trim(req.getEventCity());
        if (city.isEmpty()) {
            throw new BizException(ErrorCode.BAD_REQUEST, "缺少活动场次");
        }

        // ① 入参自检，先把明显不合法的请求挡在锁外面
        Map<String, SeatBoardSaveRequest.TableRow> tableByNo = new LinkedHashMap<>();
        List<SeatBoardSaveRequest.TableRow> tables = req.getTables() == null ? List.of() : req.getTables();
        for (SeatBoardSaveRequest.TableRow row : tables) {
            String tableNo = trim(row.getTableNo());
            if (tableNo.isEmpty()) {
                throw new BizException(ErrorCode.BAD_REQUEST, "桌号不能为空");
            }
            if (tableNo.length() > 32) {
                throw new BizException(ErrorCode.BAD_REQUEST, "桌号超出长度限制：" + tableNo);
            }
            row.setTableNo(tableNo);
            if (tableByNo.put(tableNo, row) != null) {
                throw new BizException(ErrorCode.BAD_REQUEST, "桌号重复：" + tableNo);
            }
        }
        Map<String, String> assignmentByPhone = new LinkedHashMap<>();
        List<SeatBoardSaveRequest.AssignmentRow> assignments =
                req.getAssignments() == null ? List.of() : req.getAssignments();
        for (SeatBoardSaveRequest.AssignmentRow row : assignments) {
            String phone = trim(row.getPhone());
            String tableNo = trim(row.getTableNo());
            if (phone.isEmpty()) {
                throw new BizException(ErrorCode.BAD_REQUEST, "存在缺少手机号的分配记录");
            }
            if (!tableByNo.containsKey(tableNo)) {
                throw new BizException(ErrorCode.BAD_REQUEST, "分配到了不存在的桌位：" + tableNo);
            }
            if (assignmentByPhone.put(phone, tableNo) != null) {
                throw new BizException(ErrorCode.BAD_REQUEST, "同一位嘉宾被重复分配：" + phone);
            }
        }

        String lockName = LOCK_PREFIX + city;
        if (!acquireLock(lockName)) {
            throw new BizException(ErrorCode.CONFLICT, "该场次桌位正在被其他管理员保存，请稍后重试");
        }
        try {
            return applySave(city, req, tableByNo, assignmentByPhone, admin);
        } finally {
            releaseLock(lockName);
        }
    }

    private Map<String, Object> applySave(String city, SeatBoardSaveRequest req,
                                          Map<String, SeatBoardSaveRequest.TableRow> tableByNo,
                                          Map<String, String> assignmentByPhone, AdminUser admin) {
        // ② 版本校验：挡住「A 打开 → B 保存 → A 保存」这种陈旧快照覆盖
        SeatRevision revision = revisionMapper.selectById(city);
        long current = revision == null || revision.getRevision() == null ? 0L : revision.getRevision();
        long incoming = req.getRevision() == null ? 0L : req.getRevision();
        if (current != incoming) {
            throw new BizException(ErrorCode.CONFLICT, "该场次桌位已被其他管理员修改，请重新打开");
        }

        // ③ 人员校验：只允许分配本场次审核通过的登记参会人
        List<SeatBoardPerson> roster = boardMapper.selectRoster(city);
        Map<String, String> nameByPhone = new LinkedHashMap<>();
        for (SeatBoardPerson person : roster) {
            nameByPhone.put(person.getPhone(), person.getName());
        }
        int unknown = 0;
        for (String phone : assignmentByPhone.keySet()) {
            if (!nameByPhone.containsKey(phone)) unknown += 1;
        }
        if (unknown > 0) {
            throw new BizException(ErrorCode.CONFLICT,
                    "有 " + unknown + " 位人员不在本场次已通过的登记名单中，请重新打开后再操作");
        }

        LocalDateTime now = LocalDateTime.now();
        Long adminId = admin == null ? null : admin.getId();
        String adminName = admin == null ? null : admin.getDisplayName();

        // ④ 桌位定义：先删掉不再存在的桌号，再按入参顺序写入（改名等价于删旧名 + 建新名）
        List<SeatTable> existingTables = listTables(city);
        Map<String, SeatTable> tableByExistingNo = new LinkedHashMap<>();
        for (SeatTable table : existingTables) {
            tableByExistingNo.put(table.getTableNo(), table);
        }
        int tablesRemoved = 0;
        for (SeatTable table : existingTables) {
            if (tableByNo.containsKey(table.getTableNo())) continue;
            tableMapper.deleteById(table.getId());
            tablesRemoved += 1;
        }
        int tablesAdded = 0;
        int fallbackSort = 0;
        for (SeatBoardSaveRequest.TableRow row : tableByNo.values()) {
            int sort = row.getSortNo() == null ? fallbackSort : row.getSortNo();
            fallbackSort = sort + 1;
            SeatTable target = tableByExistingNo.get(row.getTableNo());
            if (target == null) {
                SeatTable entity = new SeatTable();
                entity.setEventCity(city);
                entity.setTableNo(row.getTableNo());
                entity.setCapacity(row.getCapacity());
                entity.setSortNo(sort);
                entity.setCreatedAt(now);
                entity.setUpdatedAt(now);
                tableMapper.insert(entity);
                tablesAdded += 1;
            } else {
                target.setSortNo(sort);
                target.setUpdatedAt(now);
                tableMapper.updateById(target);
            }
        }

        // ⑤ 桌位行全量替换：不入参的人一律解除桌位（含对不上登记的历史孤儿行）
        List<Seat> existingSeats = seatMapper.selectList(new LambdaQueryWrapper<Seat>()
                .eq(Seat::getEventCity, city));
        Map<String, Seat> seatByPhone = new LinkedHashMap<>();
        for (Seat seat : existingSeats) {
            seatByPhone.put(seat.getPhone(), seat);
        }
        int orphansCleaned = 0;
        int unassigned = 0;
        for (Seat seat : existingSeats) {
            if (assignmentByPhone.containsKey(seat.getPhone())) continue;
            if (nameByPhone.containsKey(seat.getPhone())) {
                unassigned += 1;
            } else {
                orphansCleaned += 1;
            }
            seatMapper.deleteById(seat.getId());
        }
        int assigned = 0;
        for (Map.Entry<String, String> entry : assignmentByPhone.entrySet()) {
            String phone = entry.getKey();
            String tableNo = entry.getValue();
            Seat seat = seatByPhone.get(phone);
            if (seat == null) {
                Seat entity = new Seat();
                entity.setEventCity(city);
                entity.setName(nameByPhone.get(phone));
                entity.setPhone(phone);
                entity.setTableNo(tableNo);
                entity.setCreatedAt(now);
                entity.setUpdatedAt(now);
                seatMapper.insert(entity);
            } else {
                seat.setName(nameByPhone.get(phone));
                seat.setTableNo(tableNo);
                seat.setUpdatedAt(now);
                seatMapper.updateById(seat);
            }
            assigned += 1;
        }

        // ⑥ 版本号 +1，并留下「谁改的」
        if (revision == null) {
            SeatRevision created = new SeatRevision();
            created.setEventCity(city);
            created.setRevision(1L);
            created.setUpdatedBy(adminId);
            created.setUpdatedByName(adminName);
            created.setUpdatedAt(now);
            revisionMapper.insert(created);
        } else {
            revision.setRevision(current + 1);
            revision.setUpdatedBy(adminId);
            revision.setUpdatedByName(adminName);
            revision.setUpdatedAt(now);
            revisionMapper.updateById(revision);
        }

        Map<String, Object> changes = new LinkedHashMap<>();
        changes.put("tablesAdded", tablesAdded);
        changes.put("tablesRemoved", tablesRemoved);
        changes.put("assigned", assigned);
        changes.put("unassigned", unassigned);
        changes.put("orphansCleaned", orphansCleaned);

        Map<String, Object> result = board(city, true);
        result.put("changes", changes);
        return result;
    }

    private boolean acquireLock(String name) {
        Integer result = boardMapper.acquireLock(name, LOCK_TIMEOUT_SECONDS);
        return result != null && result == 1;
    }

    private void releaseLock(String name) {
        try {
            boardMapper.releaseLock(name);
        } catch (Exception e) {
            log.warn("场次锁释放失败: {} ({})", name, e.getClass().getSimpleName());
        }
    }

    List<SeatTable> listTables(String city) {
        return tableMapper.selectList(new LambdaQueryWrapper<SeatTable>()
                .eq(SeatTable::getEventCity, city)
                .orderByAsc(SeatTable::getSortNo)
                .orderByAsc(SeatTable::getId));
    }

    static String trim(String value) {
        return value == null ? "" : value.trim();
    }
}
