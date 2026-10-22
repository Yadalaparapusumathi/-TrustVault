package com.trustvault.security;

import com.trustvault.auth.SessionCookies;
import com.trustvault.auth.SessionService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

/** Resolves the TV_SESSION cookie against the database on every request. Not a bean: registered in SecurityConfig. */
public class SessionAuthenticationFilter extends OncePerRequestFilter {

    private final SessionService sessionService;
    private final SessionCookies cookies;

    public SessionAuthenticationFilter(SessionService sessionService, SessionCookies cookies) {
        this.sessionService = sessionService;
        this.cookies = cookies;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Optional<String> token = cookies.read(request);
        if (token.isPresent()) {
            Optional<AuthenticatedUser> user = sessionService.authenticate(token.get());
            if (user.isPresent()) {
                AuthenticatedUser principal = user.get();
                var auth = new UsernamePasswordAuthenticationToken(principal, null,
                        List.of(new SimpleGrantedAuthority(principal.role().authority())));
                SecurityContext context = SecurityContextHolder.createEmptyContext();
                context.setAuthentication(auth);
                SecurityContextHolder.setContext(context);
            } else {
                cookies.clear(response);
            }
        }
        try {
            chain.doFilter(request, response);
        } finally {
            SecurityContextHolder.clearContext();
        }
    }
}
