package com.trustvault.common;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;

/** Builds RFC 7807 bodies, both for controllers and for servlet filters that run before Spring MVC. */
@Component
public class Problems {

    private final ObjectMapper objectMapper;

    public Problems(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public static ProblemDetail build(HttpStatus status, String title, String detail, HttpServletRequest request) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setTitle(title);
        if (request != null) {
            problem.setInstance(URI.create(request.getRequestURI()));
        }
        String requestId = MDC.get("requestId");
        if (requestId != null) {
            problem.setProperty("requestId", requestId);
        }
        return problem;
    }

    public void write(HttpServletRequest request, HttpServletResponse response, HttpStatus status, String title,
                      String detail) throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        objectMapper.writeValue(response.getOutputStream(), build(status, title, detail, request));
    }
}
