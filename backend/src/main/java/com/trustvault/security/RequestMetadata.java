package com.trustvault.security;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.MDC;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/** Who-is-calling-from-where details for the audit trail. Empty outside of an HTTP request (e.g. scheduled jobs). */
public record RequestMetadata(String ip, String userAgent, String requestId) {

    private static final int MAX_UA = 255;

    public static RequestMetadata current() {
        String requestId = MDC.get(RequestIdFilter.MDC_KEY);
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attrs) {
            return from(attrs.getRequest(), requestId);
        }
        return new RequestMetadata(null, null, requestId);
    }

    public static RequestMetadata from(HttpServletRequest request, String requestId) {
        // getRemoteAddr() already reflects X-Forwarded-For only when the immediate peer is a trusted internal proxy
        // (server.forward-headers-strategy=native / Tomcat RemoteIpValve).
        String ua = request.getHeader("User-Agent");
        if (ua != null) {
            ua = ua.replaceAll("\\p{Cntrl}", "");
            if (ua.length() > MAX_UA) {
                ua = ua.substring(0, MAX_UA);
            }
        }
        return new RequestMetadata(request.getRemoteAddr(), ua, requestId);
    }
}
