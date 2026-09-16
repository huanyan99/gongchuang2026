package com.example.app.service;

import com.example.app.entity.LotteryDraw;
import com.example.app.mapper.LotteryDrawMapper;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import java.util.ArrayList;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class LuckyCodeGeneratorServiceTest {
    @Test void generatedCodeFollowsCityPrefixAndAvoidsFour() {
        LotteryDrawMapper mapper = mock(LotteryDrawMapper.class);
        when(mapper.insert(any(LotteryDraw.class))).thenReturn(1);
        LotteryDraw draw = new LuckyCodeGeneratorService(mapper).getOrCreate(100L, "上海");
        assertTrue(draw.getLuckyCode().matches("8[012356789]{3}"));
        assertFalse(draw.getLuckyCode().contains("4"));
    }

    @Test void databaseRejectsDuplicateCodesAcrossUsers() throws Exception {
        try (var connection = java.sql.DriverManager.getConnection("jdbc:h2:mem:uniqueLottery;MODE=MySQL")) {
            var schema = java.nio.file.Files.readString(java.nio.file.Path.of("src/main/resources/db/schema-h2.sql"));
            var matcher = java.util.regex.Pattern.compile("CREATE TABLE IF NOT EXISTS gonghcuang_lottery_draw[\\s\\S]*?;").matcher(schema);
            assertTrue(matcher.find());
            try (var statement = connection.createStatement()) {
                statement.execute(matcher.group());
                statement.execute("INSERT INTO gonghcuang_lottery_draw(user_id,lucky_code) VALUES(1,'0012')");
                assertThrows(java.sql.SQLException.class, () -> statement.execute("INSERT INTO gonghcuang_lottery_draw(user_id,lucky_code) VALUES(2,'0012')"));
                statement.execute("INSERT INTO gonghcuang_lottery_draw(user_id,lucky_code) VALUES(2,'0013')");
            }
        }
    }
    @Test void collisionRetriesDifferentNumber() {
        LotteryDrawMapper mapper = mock(LotteryDrawMapper.class);
        List<String> attempted = new ArrayList<>();
        when(mapper.insert(any(LotteryDraw.class))).thenAnswer(call -> {
            LotteryDraw draw = call.getArgument(0); attempted.add(draw.getLuckyCode());
            if (attempted.size() == 1) throw new DuplicateKeyException("occupied");
            return 1;
        });
        LotteryDraw draw = new LuckyCodeGeneratorService(mapper).getOrCreate(2L, "佛山");
        assertEquals(2, attempted.size());
        assertNotEquals(attempted.get(0), draw.getLuckyCode());
        assertTrue(draw.getLuckyCode().matches("[0-9]{4}"));
        assertEquals(2L, draw.getUserId());
    }
    @Test void existingNumberIsNeverReplaced() {
        LotteryDrawMapper mapper = mock(LotteryDrawMapper.class);
        LotteryDraw old = new LotteryDraw(); old.setLuckyCode("5458");
        when(mapper.selectOne(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class))).thenReturn(old);
        assertSame(old, new LuckyCodeGeneratorService(mapper).getOrCreate(9L, "上海"));
        verify(mapper, never()).insert(any(LotteryDraw.class));
    }
    @Test void concurrentSameUserReturnsWinningNumber() {
        LotteryDrawMapper mapper = mock(LotteryDrawMapper.class);
        LotteryDraw winner = new LotteryDraw(); winner.setLuckyCode("0012");
        when(mapper.selectOne(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class))).thenReturn(null, winner);
        when(mapper.insert(any(LotteryDraw.class))).thenThrow(new DuplicateKeyException("same user"));
        assertSame(winner, new LuckyCodeGeneratorService(mapper).getOrCreate(2L, "佛山"));
    }
}
