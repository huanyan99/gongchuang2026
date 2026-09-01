package com.example.app.exception;

import com.example.app.common.BizException;
import com.example.app.common.ErrorCode;
import com.example.app.common.Result;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.stream.Collectors;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    /** 业务异常：可预期的失败，info 级日志即可 */
    @ExceptionHandler(BizException.class)
    public Result<Void> handleBiz(BizException e) {
        log.info("业务异常: code={}, msg={}", e.getErrorCode().getCode(), e.getMessage());
        return Result.fail(e.getErrorCode(), e.getMessage());
    }

    /** 参数校验失败：@Valid 不通过 */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Result<Void> handleValidation(MethodArgumentNotValidException e) {
        String detail = e.getBindingResult().getFieldErrors().stream()
                .map(f -> f.getField() + ": " + f.getDefaultMessage())
                .collect(Collectors.joining("; "));
        return Result.fail(ErrorCode.BAD_REQUEST, detail);
    }

    /** @Validated 方法参数校验失败 */
    @ExceptionHandler(ConstraintViolationException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Result<Void> handleConstraint(ConstraintViolationException e) {
        String detail = e.getConstraintViolations().stream()
                .map(ConstraintViolation::getMessage)
                .collect(Collectors.joining("; "));
        return Result.fail(ErrorCode.BAD_REQUEST, detail);
    }

    @ExceptionHandler({
            HandlerMethodValidationException.class,
            HttpMessageNotReadableException.class,
            MissingServletRequestParameterException.class,
            MethodArgumentTypeMismatchException.class
    })
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Result<Void> handleBadRequest(Exception e) {
        log.info("请求参数异常: {}", e.getMessage());
        return Result.fail(ErrorCode.BAD_REQUEST);
    }

    @ExceptionHandler(MissingRequestHeaderException.class)
    @ResponseStatus(HttpStatus.UNAUTHORIZED)
    public Result<Void> handleMissingHeader(MissingRequestHeaderException e) {
        if ("X-Admin-Key".equalsIgnoreCase(e.getHeaderName())) {
            return Result.fail(ErrorCode.UNAUTHORIZED);
        }
        return Result.fail(ErrorCode.BAD_REQUEST, "缺少请求头: " + e.getHeaderName());
    }

    /** 数据库唯一键冲突（并发下重复提交的兜底） */
    @ExceptionHandler(DuplicateKeyException.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    public Result<Void> handleDuplicate(DuplicateKeyException e) {
        String detail = e.getMostSpecificCause() != null ? e.getMostSpecificCause().getMessage() : e.getMessage();
        log.warn("唯一键冲突: {}", detail);
        String msg = detail == null ? "" : detail.toLowerCase();
        if (msg.contains("openid")) {
            return Result.fail(ErrorCode.CONFLICT, "账号已存在，请重试登录");
        }
        if (msg.contains("gonghcuang_invitation")) {
            return Result.fail(ErrorCode.INVITATION_CODE_CONFLICT);
        }
        return Result.fail(ErrorCode.APPLY_DUPLICATED);
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Result<Void> handleIntegrity(DataIntegrityViolationException e) {
        log.warn("数据完整性冲突: {}", e.getMostSpecificCause() != null ? e.getMostSpecificCause().getMessage() : e.getMessage());
        return Result.fail(ErrorCode.BAD_REQUEST, "提交内容超出限制或不符合要求");
    }

    @ExceptionHandler(NoResourceFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public Result<Void> handleNotFound(NoResourceFoundException e) {
        return Result.fail(ErrorCode.NOT_FOUND);
    }

    /** 未预期异常：error 级日志 + 堆栈，对外不泄露细节 */
    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public Result<Void> handleOther(Exception e) {
        log.error("未处理异常", e);
        return Result.fail(ErrorCode.INTERNAL_ERROR);
    }
}
