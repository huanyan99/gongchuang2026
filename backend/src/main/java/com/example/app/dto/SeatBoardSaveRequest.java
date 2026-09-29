package com.example.app.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/** 桌位看板保存请求：提交「最终状态」，服务端按场次全量替换；id 仅前端使用，服务端以桌号为准。 */
@Data
public class SeatBoardSaveRequest {

    private String eventCity;

    /** 打开看板时拿到的版本号，与库中不一致说明别人改过，服务端拒绝写入 */
    private Long revision;

    private List<TableRow> tables = new ArrayList<>();

    /** 只列出现已分配桌位的人；未出现即视为未分配 */
    private List<AssignmentRow> assignments = new ArrayList<>();

    @Data
    public static class TableRow {
        private Long id;
        private String tableNo;
        private Integer capacity;
        private Integer sortNo;
    }

    @Data
    public static class AssignmentRow {
        private String phone;
        private String tableNo;
    }
}
