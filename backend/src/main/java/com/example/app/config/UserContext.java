package com.example.app.config;

import com.example.app.common.BizException;
import com.example.app.common.ErrorCode;
import com.example.app.entity.User;

/** 当前请求登录用户（由 AuthInterceptor 写入） */
public final class UserContext {

    private static final ThreadLocal<User> HOLDER = new ThreadLocal<>();

    private UserContext() {
    }

    public static void set(User user) {
        HOLDER.set(user);
    }

    public static User get() {
        return HOLDER.get();
    }

    public static User require() {
        User user = HOLDER.get();
        if (user == null || user.getId() == null) {
            throw new BizException(ErrorCode.UNAUTHORIZED);
        }
        return user;
    }

    public static void clear() {
        HOLDER.remove();
    }
}
