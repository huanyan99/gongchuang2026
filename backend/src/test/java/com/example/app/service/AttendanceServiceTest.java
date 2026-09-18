package com.example.app.service;
import com.example.app.common.BizException;
import com.example.app.entity.*;
import com.example.app.mapper.CheckinRecordMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import java.util.*;
import java.time.LocalDateTime;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;
class AttendanceServiceTest {
 final ApplicationService apps=mock(ApplicationService.class);
 final InvitationService invitations=mock(InvitationService.class);
 final CheckinRecordMapper records=mock(CheckinRecordMapper.class);
 final AttendanceService service=new AttendanceService(apps,invitations,records);
 final User user=new User(); final Application app=new Application();
 void setup(String status) {
  user.setId(2L); user.setPhone("13800000002"); app.setId(10L); app.setStatus(status);
  when(apps.findForAttendee(user)).thenReturn(app);
  ApplicationGuest owner=new ApplicationGuest(); owner.setPhone("13800000001");
  ApplicationGuest guest=new ApplicationGuest(); guest.setPhone(user.getPhone()); guest.setName("Companion");
  when(apps.loadGuests(10L)).thenReturn(List.of(owner,guest));
 }
 @Test void repeatScansRecordOnlyTheLoggedInPerson() {
  setup("APPROVED"); service.scan(user); service.scan(user);
  var captor=ArgumentCaptor.forClass(CheckinRecord.class);
  verify(records,times(2)).insert(captor.capture());
  assertNotSame(captor.getAllValues().get(0),captor.getAllValues().get(1));
  for(var record:captor.getAllValues()) {
   assertEquals("Companion",record.getName()); assertEquals(user.getPhone(),record.getPhone());
   assertEquals(10L,record.getApplicationId()); assertNotNull(record.getScannedAt());
  }
 }
 @Test void rejectsUnapprovedMissingOrUnmatchedPerson() {
  for(String status:List.of("PENDING","REJECTED")) { setup(status); assertThrows(BizException.class,()->service.scan(user)); }
  when(apps.findForAttendee(user)).thenReturn(null); assertThrows(BizException.class,()->service.scan(user));
  setup("APPROVED"); user.setPhone("13900000000"); assertThrows(BizException.class,()->service.scan(user));
  verify(records,never()).insert(any(CheckinRecord.class));
 }
 @Test void exportSeparatesPeopleAndApplicationsAndCountsAllScans() {
  var a=new LinkedHashMap<String,Object>(); a.put("登记编号",10L); a.put("手机号","1");
  var b=new LinkedHashMap<String,Object>(); b.put("登记编号",10L); b.put("手机号","2");
  var c=new LinkedHashMap<String,Object>(); c.put("登记编号",11L); c.put("手机号","2");
  when(apps.exportAttendees(null,null)).thenReturn(List.of(a,b,c));
  CheckinRecord first=new CheckinRecord(); first.setApplicationId(10L); first.setPhone("2"); first.setScannedAt(LocalDateTime.of(2026,9,17,10,0));
  CheckinRecord last=new CheckinRecord(); last.setApplicationId(10L); last.setPhone("2"); last.setScannedAt(first.getScannedAt().plusMinutes(1));
  when(records.selectList(any())).thenReturn(List.of(first,last)); service.attendees(null,null);
  assertEquals("未签到",a.get("签到状态")); assertEquals(0,a.get("签到次数"));
  assertEquals("已签到",b.get("签到状态")); assertEquals(2,b.get("签到次数"));
  assertEquals(first.getScannedAt().toString(),b.get("首次签到时间"));
  assertEquals(last.getScannedAt().toString(),b.get("最近签到时间")); assertEquals("未签到",c.get("签到状态"));
 }
 @Test void migrationAllowsRepeatedScansAndCanRunTwice() throws Exception {
  try(var connection=java.sql.DriverManager.getConnection("jdbc:h2:mem:attendance;MODE=MySQL","sa","")) {
   String sql=java.nio.file.Files.readString(java.nio.file.Path.of("src/main/resources/db/migrate_v15_attendance.sql"));
   try(var stmt=connection.createStatement()) {
    stmt.execute(sql); stmt.execute(sql);
    String insert="INSERT INTO gonghcuang_checkin_record(application_id,user_id,phone,name,scanned_at) VALUES (10,2,'2','Guest',CURRENT_TIMESTAMP)";
    stmt.executeUpdate(insert); stmt.executeUpdate(insert);
    try(var result=stmt.executeQuery("SELECT COUNT(*) FROM gonghcuang_checkin_record")) { assertTrue(result.next()); assertEquals(2,result.getInt(1)); }
   }
  }
 }
}
