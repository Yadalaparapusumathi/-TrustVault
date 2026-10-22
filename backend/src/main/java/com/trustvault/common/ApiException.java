package com.trustvault.common;

import org.springframework.http.HttpStatus;

/** An error whose status, title and detail are safe to show to the caller. */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String title;

    public ApiException(HttpStatus status, String title, String detail) {
        super(detail);
        this.status = status;
        this.title = title;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getTitle() {
        return title;
    }

    public static ApiException notFound(String detail) {
        return new ApiException(HttpStatus.NOT_FOUND, "Not Found", detail);
    }

    public static ApiException forbidden(String detail) {
        return new ApiException(HttpStatus.FORBIDDEN, "Forbidden", detail);
    }

    public static ApiException badRequest(String detail) {
        return new ApiException(HttpStatus.BAD_REQUEST, "Bad Request", detail);
    }

    public static ApiException conflict(String detail) {
        return new ApiException(HttpStatus.CONFLICT, "Conflict", detail);
    }

    public static ApiException unsupportedMediaType(String detail) {
        return new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Unsupported Media Type", detail);
    }

    public static ApiException payloadTooLarge(String detail) {
        return new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "Payload Too Large", detail);
    }

    public static ApiException tooManyRequests(String detail) {
        return new ApiException(HttpStatus.TOO_MANY_REQUESTS, "Too Many Requests", detail);
    }

    public static ApiException unauthorized(String detail) {
        return new ApiException(HttpStatus.UNAUTHORIZED, "Unauthorized", detail);
    }
}
