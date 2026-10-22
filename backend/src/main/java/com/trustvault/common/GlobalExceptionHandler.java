package com.trustvault.common;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.LinkedHashMap;
import java.util.Map;

/** Every error leaves as RFC 7807 with a safe message. Internals (stack traces, SQL, class names) never do. */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ProblemDetail> api(ApiException e, HttpServletRequest request) {
        return respond(e.getStatus(), e.getTitle(), e.getMessage(), request);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ProblemDetail> invalid(MethodArgumentNotValidException e, HttpServletRequest request) {
        Map<String, String> errors = new LinkedHashMap<>();
        e.getBindingResult().getFieldErrors().forEach(f -> errors.putIfAbsent(f.getField(), f.getDefaultMessage()));
        ProblemDetail problem = Problems.build(HttpStatus.BAD_REQUEST, "Validation failed",
                "One or more fields are invalid", request);
        problem.setProperty("errors", errors);
        return ResponseEntity.badRequest().body(problem);
    }

    @ExceptionHandler({ConstraintViolationException.class, HandlerMethodValidationException.class,
            MissingServletRequestParameterException.class, MissingServletRequestPartException.class,
            HttpMessageNotReadableException.class})
    ResponseEntity<ProblemDetail> badRequest(Exception e, HttpServletRequest request) {
        return respond(HttpStatus.BAD_REQUEST, "Bad Request", "The request is malformed or incomplete", request);
    }

    /** A malformed id in a path is answered like an unknown id: no hint about the id format or existence. */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ResponseEntity<ProblemDetail> typeMismatch(MethodArgumentTypeMismatchException e, HttpServletRequest request) {
        if (request.getRequestURI().startsWith("/api/documents/") && "id".equals(e.getName())) {
            return respond(HttpStatus.NOT_FOUND, "Not Found", "Document not found", request);
        }
        return respond(HttpStatus.BAD_REQUEST, "Bad Request", "Invalid value for '" + e.getName() + "'", request);
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<ProblemDetail> tooLarge(MaxUploadSizeExceededException e, HttpServletRequest request) {
        return respond(HttpStatus.PAYLOAD_TOO_LARGE, "Payload Too Large", "The file exceeds the 20 MB limit", request);
    }

    @ExceptionHandler(MultipartException.class)
    ResponseEntity<ProblemDetail> multipart(MultipartException e, HttpServletRequest request) {
        return respond(HttpStatus.BAD_REQUEST, "Bad Request", "The upload is malformed", request);
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    ResponseEntity<ProblemDetail> mediaType(HttpMediaTypeNotSupportedException e, HttpServletRequest request) {
        return respond(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Unsupported Media Type", "Unsupported request content type",
                request);
    }

    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    ResponseEntity<ProblemDetail> stale(ObjectOptimisticLockingFailureException e, HttpServletRequest request) {
        return respond(HttpStatus.CONFLICT, "Conflict", "The record was changed by someone else. Reload and try again.",
                request);
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ProblemDetail> integrity(DataIntegrityViolationException e, HttpServletRequest request) {
        log.warn("Data integrity violation: {}", e.getMostSpecificCause().getMessage());
        return respond(HttpStatus.CONFLICT, "Conflict", "The change conflicts with existing data", request);
    }

    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<ProblemDetail> denied(AccessDeniedException e, HttpServletRequest request) {
        return respond(HttpStatus.FORBIDDEN, "Forbidden", "You are not allowed to perform this action", request);
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    ResponseEntity<ProblemDetail> method(HttpRequestMethodNotSupportedException e, HttpServletRequest request) {
        return respond(HttpStatus.METHOD_NOT_ALLOWED, "Method Not Allowed", "Method not allowed", request);
    }

    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<ProblemDetail> noResource(NoResourceFoundException e, HttpServletRequest request) {
        return respond(HttpStatus.NOT_FOUND, "Not Found", "Not found", request);
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ProblemDetail> unexpected(Exception e, HttpServletRequest request) {
        log.error("Unhandled error on {} {}", request.getMethod(), request.getRequestURI(), e);
        return respond(HttpStatus.INTERNAL_SERVER_ERROR, "Internal Server Error",
                "Something went wrong. Quote the request id if you contact support.", request);
    }

    private static ResponseEntity<ProblemDetail> respond(HttpStatus status, String title, String detail,
                                                         HttpServletRequest request) {
        return ResponseEntity.status(status).body(Problems.build(status, title, detail, request));
    }
}
