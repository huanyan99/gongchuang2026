package com.example.app.service;

import com.example.app.common.BizException;
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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 桌位看板保存：并发（版本号/锁）、人员归属、孤儿清理、删桌退回未分配 */
class SeatBoardServiceTest {

    final SeatTableMapper tableMapper = mock(SeatTableMapper.class);
    final SeatRevisionMapper revisionMapper = mock(SeatRevisionMapper.class);
    final SeatBoardMapper boardMapper = mock(SeatBoardMapper.class);
    final SeatMapper seatMapper = mock(SeatMapper.class);
    final SettingService settingService = mock(SettingService.class);
    final SeatBoardService service = new SeatBoardService(tableMapper, revisionMapper, boardMapper, seatMapper, settingService);

    final AdminUser admin = new AdminUser();

    @BeforeEach
    void setUp() {
        admin.setId(2L);
        admin.setDisplayName("超级管理员");
        when(boardMapper.acquireLock(anyString(), anyInt())).thenReturn(1);
        when(boardMapper.countOrphanSeats(anyString())).thenReturn(0);
        when(boardMapper.countRoster(anyString())).thenReturn(0);
        when(boardMapper.countAssigned(anyString())).thenReturn(0);
    }

    private static SeatBoardPerson person(String phone, String name, String tableNo) {
        SeatBoardPerson p = new SeatBoardPerson();
        p.setPhone(phone);
        p.setName(name);
        p.setContactPhone(phone);
        p.setTableNo(tableNo);
        return p;
    }

    private static SeatBoardSaveRequest request(long revision,
                                                List<SeatBoardSaveRequest.TableRow> tables,
                                                List<SeatBoardSaveRequest.AssignmentRow> assignments) {
        SeatBoardSaveRequest req = new SeatBoardSaveRequest();
        req.setEventCity("济南");
        req.setRevision(revision);
        req.setTables(tables);
        req.setAssignments(assignments);
        return req;
    }

    private static SeatBoardSaveRequest.TableRow table(String no, int sort) {
        SeatBoardSaveRequest.TableRow row = new SeatBoardSaveRequest.TableRow();
        row.setTableNo(no);
        row.setSortNo(sort);
        return row;
    }

    private static SeatBoardSaveRequest.AssignmentRow assign(String phone, String tableNo) {
        SeatBoardSaveRequest.AssignmentRow row = new SeatBoardSaveRequest.AssignmentRow();
        row.setPhone(phone);
        row.setTableNo(tableNo);
        return row;
    }

    @Test
    void rejectsStaleRevisionWithoutWriting() {
        SeatRevision revision = new SeatRevision();
        revision.setEventCity("济南");
        revision.setRevision(5L);
        when(revisionMapper.selectById("济南")).thenReturn(revision);

        BizException error = assertThrows(BizException.class, () ->
                service.save(request(3L, List.of(table("1桌", 1)), List.of()), admin));

        assertTrue(error.getMessage().contains("已被其他管理员修改"));
        verify(tableMapper, never()).insert(any(SeatTable.class));
        verify(seatMapper, never()).insert(any(Seat.class));
        verify(revisionMapper, never()).updateById(any(SeatRevision.class));
        verify(boardMapper).releaseLock(anyString());
    }

    @Test
    void rejectsPhoneNotInApprovedRoster() {
        when(revisionMapper.selectById("济南")).thenReturn(null);
        when(boardMapper.selectRoster("济南")).thenReturn(List.of(person("13800000001", "张三", null)));

        BizException error = assertThrows(BizException.class, () ->
                service.save(request(0L, List.of(table("1桌", 1)), List.of(assign("13900000009", "1桌"))), admin));

        assertTrue(error.getMessage().contains("不在本场次已通过的登记名单"));
        verify(seatMapper, never()).insert(any(Seat.class));
        verify(boardMapper).releaseLock(anyString());
    }

    @Test
    void rejectsDuplicateTableNoAndUnknownTableReference() {
        when(revisionMapper.selectById("济南")).thenReturn(null);

        BizException dup = assertThrows(BizException.class, () ->
                service.save(request(0L, List.of(table("1桌", 1), table("1桌", 2)), List.of()), admin));
        assertTrue(dup.getMessage().contains("桌号重复"));

        BizException unknown = assertThrows(BizException.class, () ->
                service.save(request(0L, List.of(table("1桌", 1)), List.of(assign("13800000001", "9桌"))), admin));
        assertTrue(unknown.getMessage().contains("不存在的桌位"));

        verify(boardMapper, never()).acquireLock(anyString(), anyInt());
    }

    @Test
    void replacesAssignmentsAndCountsOrphansAndUnassigned() {
        when(revisionMapper.selectById("济南")).thenReturn(null);
        when(boardMapper.selectRoster("济南")).thenReturn(List.of(
                person("13800000001", "张三", null),
                person("13800000002", "李四", "2桌")));
        Seat kept = seat(11L, "2桌", "13800000002");
        Seat moved = seat(12L, "3桌", "13800000003");
        Seat orphan = seat(13L, "5桌", "13900000000");
        when(seatMapper.selectList(any())).thenReturn(List.of(kept, moved, orphan));

        Map<String, Object> result = service.save(request(0L,
                List.of(table("1桌", 1), table("2桌", 2)),
                List.of(assign("13800000001", "1桌"), assign("13800000002", "2桌"))), admin);

        // 张三新插入到 1 桌，李四保持 2 桌；3 桌那位（不在名单里=孤儿）与 5 桌孤儿行都被删除
        ArgumentCaptor<Seat> inserted = ArgumentCaptor.forClass(Seat.class);
        verify(seatMapper, times(1)).insert(inserted.capture());
        assertEquals("13800000001", inserted.getValue().getPhone());
        assertEquals("1桌", inserted.getValue().getTableNo());
        assertEquals("张三", inserted.getValue().getName());
        ArgumentCaptor<Seat> updated = ArgumentCaptor.forClass(Seat.class);
        verify(seatMapper, times(1)).updateById(updated.capture());
        assertEquals("13800000002", updated.getValue().getPhone());
        assertEquals("2桌", updated.getValue().getTableNo());
        assertEquals("李四", updated.getValue().getName());
        verify(seatMapper).deleteById(12L);
        verify(seatMapper).deleteById(13L);

        @SuppressWarnings("unchecked")
        Map<String, Object> changes = (Map<String, Object>) result.get("changes");
        assertEquals(2, changes.get("assigned"));
        assertEquals(0, changes.get("unassigned"));
        assertEquals(2, changes.get("orphansCleaned"));
        verify(boardMapper).releaseLock(anyString());
    }

    @Test
    void removingTableUnassignsItsOccupants() {
        when(revisionMapper.selectById("济南")).thenReturn(null);
        when(boardMapper.selectRoster("济南")).thenReturn(List.of(person("13800000002", "李四", "2桌")));
        SeatTable tableA = new SeatTable();
        tableA.setId(21L);
        tableA.setEventCity("济南");
        tableA.setTableNo("1桌");
        tableA.setSortNo(1);
        SeatTable tableB = new SeatTable();
        tableB.setId(22L);
        tableB.setEventCity("济南");
        tableB.setTableNo("2桌");
        tableB.setSortNo(2);
        when(tableMapper.selectList(any())).thenReturn(List.of(tableA, tableB));
        when(seatMapper.selectList(any())).thenReturn(List.of(seat(31L, "2桌", "13800000002")));

        Map<String, Object> result = service.save(request(0L,
                List.of(table("1桌", 1)), List.of()), admin);

        // 2 桌被删除，桌上的人退回未分配（删除桌位行），不算孤儿
        verify(tableMapper).deleteById(22L);
        verify(seatMapper).deleteById(31L);
        @SuppressWarnings("unchecked")
        Map<String, Object> changes = (Map<String, Object>) result.get("changes");
        assertEquals(1, changes.get("tablesRemoved"));
        assertEquals(1, changes.get("unassigned"));
        assertEquals(0, changes.get("orphansCleaned"));
    }

    @Test
    void bumpsRevisionAndKeepsAdminTrail() {
        SeatRevision revision = new SeatRevision();
        revision.setEventCity("济南");
        revision.setRevision(4L);
        when(revisionMapper.selectById("济南")).thenReturn(revision);
        when(boardMapper.selectRoster("济南")).thenReturn(List.of());

        service.save(request(4L, List.of(), List.of()), admin);

        ArgumentCaptor<SeatRevision> saved = ArgumentCaptor.forClass(SeatRevision.class);
        verify(revisionMapper).updateById(saved.capture());
        assertEquals(5L, saved.getValue().getRevision());
        assertEquals(2L, saved.getValue().getUpdatedBy());
        assertEquals("超级管理员", saved.getValue().getUpdatedByName());
        assertNotNull(saved.getValue().getUpdatedAt());
    }

    @Test
    void returnsConflictWhenCityLockIsBusy() {
        when(boardMapper.acquireLock(anyString(), anyInt())).thenReturn(0);

        BizException error = assertThrows(BizException.class, () ->
                service.save(request(0L, List.of(), List.of()), admin));

        assertTrue(error.getMessage().contains("正在被其他管理员保存"));
        verify(revisionMapper, never()).selectById(anyString());
        verify(boardMapper, never()).releaseLock(anyString());
    }

    private static Seat seat(Long id, String tableNo, String phone) {
        Seat seat = new Seat();
        seat.setId(id);
        seat.setEventCity("济南");
        seat.setTableNo(tableNo);
        seat.setPhone(phone);
        seat.setName("某人");
        return seat;
    }
}
