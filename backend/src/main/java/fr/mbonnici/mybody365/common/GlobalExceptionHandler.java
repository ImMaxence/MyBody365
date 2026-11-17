package fr.mbonnici.mybody365.common;

import fr.mbonnici.mybody365.support.ErrorLogService;
import fr.mbonnici.mybody365.user.AppUser;
import fr.mbonnici.mybody365.user.AppUserRepository;
import jakarta.servlet.http.HttpServletRequest;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.UUID;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.info.BuildProperties;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import jakarta.validation.ConstraintViolationException;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    private final ErrorLogService errors;
    private final AppUserRepository users;
    private final String version;

    public GlobalExceptionHandler(ErrorLogService errors, AppUserRepository users, ObjectProvider<BuildProperties> build) {
        this.errors = errors;
        this.users = users;
        BuildProperties b = build.getIfAvailable();
        this.version = b == null ? null : b.getVersion();
    }

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiError> handleApi(ApiException ex, HttpServletRequest req) {
        return build(ex.status(), ex.getMessage(), null, req);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException ex, HttpServletRequest req) {
        Map<String, String> fields = new LinkedHashMap<>();
        for (FieldError fe : ex.getBindingResult().getFieldErrors()) {
            fields.putIfAbsent(fe.getField(), fe.getDefaultMessage());
        }
        return build(HttpStatus.BAD_REQUEST, "validation_failed", fields, req);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiError> handleConstraint(ConstraintViolationException ex, HttpServletRequest req) {
        Map<String, String> fields = new LinkedHashMap<>();
        ex.getConstraintViolations().forEach(v -> fields.put(v.getPropertyPath().toString(), v.getMessage()));
        return build(HttpStatus.BAD_REQUEST, "validation_failed", fields, req);
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    public ResponseEntity<ApiError> handleUnreadable(Exception ex, HttpServletRequest req) {
        return build(HttpStatus.BAD_REQUEST, "malformed_request", null, req);
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiError> handleTooLarge(MaxUploadSizeExceededException ex, HttpServletRequest req) {
        return build(HttpStatus.PAYLOAD_TOO_LARGE, "file_too_large", null, req);
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiError> handleNoResource(NoResourceFoundException ex, HttpServletRequest req) {
        return build(HttpStatus.NOT_FOUND, "not_found", null, req);
    }

    /** method security and the like: Spring Security's own handling answers */
    @ExceptionHandler({AccessDeniedException.class, AuthenticationException.class})
    public void rethrowSecurity(RuntimeException ex) {
        throw ex;
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleOther(Exception ex, HttpServletRequest req) {
        // Spring's own refusals (wrong method, missing parameter…) are the client's doing: they keep their status
        if (ex instanceof ErrorResponse refused && refused.getStatusCode().is4xxClientError()) {
            HttpStatus status = HttpStatus.valueOf(refused.getStatusCode().value());
            return ResponseEntity.status(status).headers(refused.getHeaders())
                    .body(body(status, status.getReasonPhrase().toLowerCase().replace(' ', '_'), null, req));
        }
        log.error("Unhandled error on {} {}", req.getMethod(), req.getRequestURI(), ex);
        record(ex, req);
        return build(HttpStatus.INTERNAL_SERVER_ERROR, "unexpected_error", null, req);
    }

    /** for the admins' error journal: the exception, its first frames, the request, who */
    private void record(Exception ex, HttpServletRequest req) {
        try {
            StringWriter trace = new StringWriter();
            ex.printStackTrace(new PrintWriter(trace));
            String detail = String.join("\n", trace.toString().lines().limit(40).toList());
            UUID user = null;
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth != null && auth.isAuthenticated() && !(auth instanceof AnonymousAuthenticationToken)) {
                user = users.findByEmail(auth.getName()).map(AppUser::getId).orElse(null);
            }
            String message = ex.getClass().getSimpleName() + (ex.getMessage() == null ? "" : ": " + ex.getMessage());
            errors.record(ErrorLogService.Source.SERVER, message, detail, req.getMethod() + " " + req.getRequestURI(), version,
                    req.getHeader("User-Agent"), user);
        } catch (RuntimeException e) {
            log.warn("Could not record the error: {}", e.getMessage());
        }
    }

    private static ResponseEntity<ApiError> build(HttpStatus status, String code, Map<String, String> fields,
            HttpServletRequest req) {
        return ResponseEntity.status(status).body(body(status, code, fields, req));
    }

    private static ApiError body(HttpStatus status, String code, Map<String, String> fields, HttpServletRequest req) {
        return new ApiError(status.value(), status.getReasonPhrase(), code, fields, req.getRequestURI(), Instant.now());
    }
}
