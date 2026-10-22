package com.trustvault.security;

import com.trustvault.common.Problems;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Set;

/** A user holding an admin-issued temporary password can do nothing except replace it. */
public class PasswordChangeEnforcementFilter extends OncePerRequestFilter {

    private static final Set<String> ALLOWED = Set.of(
            "/api/auth/me", "/api/auth/logout", "/api/auth/change-password", "/api/auth/csrf", "/api/auth/login");

    private final Problems problems;

    public PasswordChangeEnforcementFilter(Problems problems) {
        this.problems = problems;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        var user = CurrentUser.find();
        if (user.isPresent() && user.get().mustChangePassword() && !ALLOWED.contains(request.getRequestURI())) {
            problems.write(request, response, HttpStatus.FORBIDDEN, "Password change required",
                    "You must change your temporary password before continuing");
            return;
        }
        chain.doFilter(request, response);
    }
}
