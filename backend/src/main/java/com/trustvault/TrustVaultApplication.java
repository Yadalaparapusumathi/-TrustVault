package com.trustvault;

import com.trustvault.config.AppProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;

/** No default in-memory user: authentication is only via {@code /api/auth/login} and server-side sessions. */
@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
@EnableScheduling
@EnableConfigurationProperties(AppProperties.class)
public class TrustVaultApplication {

    public static void main(String[] args) {
        SpringApplication.run(TrustVaultApplication.class, args);
    }
}
