package com.example.app.controller;
import com.example.app.common.Result;
import com.example.app.config.UserContext;
import com.example.app.entity.CheckinRecord;
import com.example.app.service.AttendanceService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/attendance")
@RequiredArgsConstructor
public class AttendanceController {
    private final AttendanceService attendance;
    @PostMapping("/scan")
    public Result<CheckinRecord> scan() { return Result.ok(attendance.scan(UserContext.require())); }
}
