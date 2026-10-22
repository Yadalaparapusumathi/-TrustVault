package com.trustvault.auth;

import com.trustvault.config.AppProperties;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Per-source-IP sliding window on login attempts. Complements the per-account lockout (which an attacker could
 * otherwise use against many accounts from one address). In-memory: correct for a single instance; a multi-instance
 * deployment would move this to the database or Redis (see THREATS.md).
 */
@Component
public class LoginThrottle {

    private final Map<String, Deque<Instant>> attempts = new ConcurrentHashMap<>();
    private final AppProperties properties;
    private final Clock clock;

    public LoginThrottle(AppProperties properties, Clock clock) {
        this.properties = properties;
        this.clock = clock;
    }

    /** Records an attempt and returns false when the caller has exceeded the window. */
    public boolean tryAcquire(String ip) {
        String key = ip == null ? "unknown" : ip;
        Instant now = clock.instant();
        Instant cutoff = now.minus(properties.security().loginWindow());
        Deque<Instant> window = attempts.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (window) {
            while (!window.isEmpty() && window.peekFirst().isBefore(cutoff)) {
                window.pollFirst();
            }
            if (window.size() >= properties.security().loginAttemptsPerIpPerWindow()) {
                return false;
            }
            window.addLast(now);
            return true;
        }
    }

    public void reset() {
        attempts.clear();
    }

    @Scheduled(fixedDelayString = "PT5M")
    public void evictIdle() {
        Instant cutoff = clock.instant().minus(properties.security().loginWindow());
        attempts.entrySet().removeIf(e -> {
            synchronized (e.getValue()) {
                return e.getValue().isEmpty() || e.getValue().peekLast().isBefore(cutoff);
            }
        });
    }
}
