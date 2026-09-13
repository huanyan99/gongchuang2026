package com.example.app.config;

import com.example.app.common.BizException;
import com.example.app.common.ErrorCode;
import com.example.app.entity.User;
import com.example.app.service.AuthService;
import com.example.app.service.PassService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
@RequiredArgsConstructor
public class AuthInterceptor implements HandlerInterceptor {

    private final AuthService authService;
    private final PassService passService;

    /** 现场通道会话允许访问的接口前缀：只放行桌位 */
    private static final String[] PASS_SCOPED_PATHS = {"/api/seat/"};

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        // 浏览器跨域预检（OPTIONS）不携带业务凭证，交由 CORS 机制处理
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        String header = request.getHeader("Authorization");
        if (header != null && header.regionMatches(true, 0, "Bearer ", 0, 7)) {
            header = header.substring(7).trim();
        }
        User user = authService.findValidByToken(header);
        if (user != null) {
            UserContext.set(user);
            UserContext.setPassScoped(false);
            return true;
        }

        // 现场通道会话：只放行抽奖码与桌位
        User passUser = passService.resolveSession(header);
        if (passUser == null) {
            throw new BizException(ErrorCode.UNAUTHORIZED);
        }
        String path = request.getRequestURI();
        boolean allowed = false;
        for (String prefix : PASS_SCOPED_PATHS) {
            if (path.startsWith(prefix)) allowed = true;
        }
        if (!allowed) {
            throw new BizException(ErrorCode.UNAUTHORIZED, "现场通道只能查看桌位");
        }
        UserContext.set(passUser);
        UserContext.setPassScoped(true);
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        UserContext.clear();
    }
}
