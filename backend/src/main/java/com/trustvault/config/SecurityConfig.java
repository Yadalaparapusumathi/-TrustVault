package com.trustvault.config;

import com.trustvault.audit.AuditAction;
import com.trustvault.audit.AuditEntry;
import com.trustvault.audit.AuditOutcome;
import com.trustvault.audit.AuditService;
import com.trustvault.auth.SessionCookies;
import com.trustvault.auth.SessionService;
import com.trustvault.common.Problems;
import com.trustvault.security.CsrfCookieFilter;
import com.trustvault.security.CurrentUser;
import com.trustvault.security.PasswordChangeEnforcementFilter;
import com.trustvault.security.SessionAuthenticationFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;

/**
 * URL-level rules are the outer fence only. Per-document decisions are made in DocumentAccessService against the
 * database on every call; nothing here grants access to a document.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http, SessionService sessionService, SessionCookies cookies,
                                           Problems problems, AuditService auditService,
                                           AppProperties properties) throws Exception {
        CookieCsrfTokenRepository csrfRepository = CookieCsrfTokenRepository.withHttpOnlyFalse();
        csrfRepository.setCookieCustomizer(c -> c.secure(properties.security().cookieSecure()).sameSite("Strict").path("/"));
        CsrfTokenRequestAttributeHandler csrfHandler = new CsrfTokenRequestAttributeHandler();
        csrfHandler.setCsrfRequestAttributeName(null);

        http
                .csrf(csrf -> csrf.csrfTokenRepository(csrfRepository).csrfTokenRequestHandler(csrfHandler))
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .requestCache(AbstractHttpConfigurer::disable)
                .anonymous(a -> a.principal("anonymous"))
                .addFilterBefore(new SessionAuthenticationFilter(sessionService, cookies), AnonymousAuthenticationFilter.class)
                .addFilterAfter(new PasswordChangeEnforcementFilter(problems), SessionAuthenticationFilter.class)
                .addFilterAfter(new CsrfCookieFilter(), CsrfFilter.class)
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.GET, "/api/auth/csrf").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/login").permitAll()
                        .requestMatchers(HttpMethod.GET, "/actuator/health").permitAll()
                        .requestMatchers("/error").permitAll()
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        .requestMatchers("/api/users/directory").hasAnyRole("OWNER", "ADMIN")
                        .requestMatchers("/api/**").authenticated()
                        .anyRequest().denyAll())
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((req, res, e) -> problems.write(req, res, HttpStatus.UNAUTHORIZED,
                                "Unauthorized", "Authentication required"))
                        .accessDeniedHandler((req, res, e) -> {
                            if (e instanceof CsrfException) {
                                problems.write(req, res, HttpStatus.FORBIDDEN, "Invalid CSRF token",
                                        "Missing or invalid CSRF token");
                                return;
                            }
                            CurrentUser.find().ifPresent(user -> auditService.recordIndependently(
                                    AuditEntry.of(AuditAction.ACCESS_DENIED).outcome(AuditOutcome.DENIED)
                                            .target("ENDPOINT", req.getMethod() + " " + req.getRequestURI())
                                            .detail("reason", "role")
                                            .detail("path", req.getMethod() + " " + req.getRequestURI())));
                            problems.write(req, res, HttpStatus.FORBIDDEN, "Forbidden",
                                    "You are not allowed to perform this action");
                        }))
                .headers(h -> h
                        .contentSecurityPolicy(csp -> csp.policyDirectives("default-src 'none'; frame-ancestors 'none'; sandbox"))
                        .frameOptions(f -> f.deny())
                        .referrerPolicy(r -> r.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER))
                        .httpStrictTransportSecurity(hsts -> hsts.includeSubDomains(true).maxAgeInSeconds(31536000)
                                .requestMatcher(req -> true)));
        return http.build();
    }
}
