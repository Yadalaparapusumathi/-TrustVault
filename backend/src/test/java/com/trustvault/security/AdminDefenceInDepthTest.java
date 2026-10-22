package com.trustvault.security;

import com.trustvault.admin.AdminController;
import com.trustvault.common.ApiException;
import com.trustvault.security.AuthenticatedUser;
import com.trustvault.support.IntegrationTest;
import com.trustvault.user.Role;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Admin endpoints are protected twice: by the URL rule in SecurityConfig and by a role check inside every controller
 * method. MockMvc tests exercise both together, so removing one layer would go unnoticed there. This test calls every
 * public AdminController method directly, bypassing the filter chain, and requires each one to refuse a non-admin.
 * A method added later without its own check fails here.
 */
class AdminDefenceInDepthTest extends IntegrationTest {

    @Autowired AdminController controller;

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    @ParameterizedTest(name = "{0}")
    @EnumSource(value = Role.class, names = {"OWNER", "VIEWER"})
    @DisplayName("Every admin controller method refuses a non-admin even without the URL rule")
    void everyMethodChecksRole(Role role) throws Exception {
        var user = newUser(role);
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthenticatedUser(user.getId(), user.getUsername(), user.getDisplayName(), role, false,
                        UUID.randomUUID()), null, List.of(new SimpleGrantedAuthority("ROLE_" + role.name()))));

        List<Method> endpoints = Arrays.stream(AdminController.class.getDeclaredMethods())
                .filter(m -> Modifier.isPublic(m.getModifiers()) && !m.isSynthetic())
                .toList();
        assertThat(endpoints).hasSizeGreaterThanOrEqualTo(11);
        for (Method m : endpoints) {
            Object[] args = new Object[m.getParameterCount()];
            for (int i = 0; i < args.length; i++) {
                Class<?> t = m.getParameterTypes()[i];
                args[i] = t == int.class ? 0 : t == long.class ? 0L : t == boolean.class ? false : null;
            }
            Throwable thrown = null;
            try {
                m.invoke(controller, args);
            } catch (InvocationTargetException e) {
                thrown = e.getCause();
            }
            assertThat(thrown).as(m.getName()).isInstanceOf(ApiException.class);
            assertThat(((ApiException) thrown).getStatus().value()).as(m.getName()).isEqualTo(403);
        }
    }
}
