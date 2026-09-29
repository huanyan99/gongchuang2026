package com.example.app.controller;

import com.example.app.common.Result;
import com.example.app.config.UserContext;
import com.example.app.service.SeatService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/** 嘉宾端桌位图：需登录，且参会登记审核通过 */
@RestController
@RequestMapping("/api/seat")
@RequiredArgsConstructor
public class SeatController {

    private final SeatService seatService;

    @GetMapping("/me")
    public Result<Map<String, Object>> me() {
        return Result.ok(seatService.mySeat(UserContext.require()));
    }

    /**
     * 场次桌位图是否对嘉宾开放：公开接口，只回布尔，不含任何嘉宾数据。
     * 嘉宾端进入桌位图前先用它判断，未开放时不请求 /me，也不必先通过审核。
     */
    @GetMapping("/visibility")
    public Result<Map<String, Object>> visibility(@RequestParam(required = false) String city) {
        String name = city == null ? "" : city.trim();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("city", name);
        body.put("visible", seatService.isSeatVisible(name));
        return Result.ok(body);
    }
}
