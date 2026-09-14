package com.example.app.config;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.List;

@Configuration
@RequiredArgsConstructor
public class WebMvcConfig implements WebMvcConfigurer {

    private final AuthInterceptor authInterceptor;

    /** 网页版（planb-web）部署来源，逗号分隔；后端接口需放通其跨域请求 */
    @Value("${app.cors.allowed-origins:http://localhost:4173,http://127.0.0.1:4173}")
    private List<String> corsAllowedOrigins;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(authInterceptor)
                .addPathPatterns("/api/auth/me", "/api/auth/phone", "/api/auth/profile", "/api/auth/profile/**", "/api/auth/logout");
        registry.addInterceptor(authInterceptor)
                .addPathPatterns("/api/apply/**")
                .excludePathPatterns("/api/apply/check-invitation");
        registry.addInterceptor(authInterceptor)
                .addPathPatterns("/api/lottery/**");
        registry.addInterceptor(authInterceptor)
                .addPathPatterns("/api/invitations/**");
        registry.addInterceptor(authInterceptor)
                .addPathPatterns("/api/seat/**");
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(corsAllowedOrigins.toArray(String[]::new))
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .maxAge(3600);
    }
}
