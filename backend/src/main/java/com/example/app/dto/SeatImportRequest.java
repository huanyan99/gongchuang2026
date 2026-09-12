package com.example.app.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.util.List;

@Data
public class SeatImportRequest {

    @NotBlank(message = "缺少活动场次")
    private String eventCity;

    /** MERGE：按手机号更新或新增；REPLACE：先清空该场次再导入 */
    private String mode;

    @NotEmpty(message = "没有可导入的桌位数据")
    private List<SeatRowRequest> rows;
}
