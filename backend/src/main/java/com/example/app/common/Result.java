package com.example.app.common;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

/** 统一响应结构，前端按 code===0 判断成功 */
@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class Result<T> {

    private int code;
    private String message;
    private T data;

    public static <T> Result<T> ok(T data) {
        Result<T> r = new Result<>();
        r.code = ErrorCode.SUCCESS.getCode();
        r.message = ErrorCode.SUCCESS.getMessage();
        r.data = data;
        return r;
    }

    public static <T> Result<T> ok() {
        return ok(null);
    }

    public static <T> Result<T> fail(ErrorCode errorCode) {
        Result<T> r = new Result<>();
        r.code = errorCode.getCode();
        r.message = errorCode.getMessage();
        return r;
    }

    public static <T> Result<T> fail(ErrorCode errorCode, String detail) {
        Result<T> r = new Result<>();
        r.code = errorCode.getCode();
        r.message = detail;
        return r;
    }
}
