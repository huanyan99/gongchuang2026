package com.example.app.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@RequiredArgsConstructor
public class WebMvcConfig implements WebMvcConfigurer {

    private final AuthInterceptor authInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(authInterceptor)
                .addPathPatterns("/api/apply/**")
                .excludePathPatterns("/api/apply/check-invitation");
        registry.addInterceptor(authInterceptor)
                .addPathPatterns("/api/lottery/**");
        registry.addInterceptor(authInterceptor)
                .addPathPatterns("/api/invitations/**");
    }
}
