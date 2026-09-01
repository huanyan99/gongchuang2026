package com.example.app.controller;

import com.example.app.common.Result;
import com.example.app.entity.EventWeather;
import com.example.app.service.EventWeatherService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/events")
@RequiredArgsConstructor
public class EventController {
    private final EventWeatherService service;

    @GetMapping
    public Result<List<EventWeather>> list() {
        return Result.ok(service.list());
    }
}
