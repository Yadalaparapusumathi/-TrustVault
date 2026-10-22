package com.trustvault.admin;

import com.trustvault.audit.AuditAction;
import com.trustvault.audit.AuditEntry;
import com.trustvault.audit.AuditEventView;
import com.trustvault.audit.AuditIntegrityService;
import com.trustvault.audit.AuditQueryService;
import com.trustvault.audit.AuditService;
import com.trustvault.audit.IntegrityReport;
import com.trustvault.common.PageResponse;
import com.trustvault.security.CurrentUser;
import com.trustvault.user.Role;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

/** /api/admin/** is restricted to ADMIN by SecurityConfig; each handler re-asserts it as defence in depth. */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AdminUserService userService;
    private final DashboardService dashboardService;
    private final AuditQueryService auditQuery;
    private final AuditIntegrityService integrity;
    private final AuditService audit;
    private final TransactionTemplate tx;

    public AdminController(AdminUserService userService, DashboardService dashboardService,
                           AuditQueryService auditQuery, AuditIntegrityService integrity, AuditService audit,
                           TransactionTemplate tx) {
        this.userService = userService;
        this.dashboardService = dashboardService;
        this.auditQuery = auditQuery;
        this.integrity = integrity;
        this.audit = audit;
        this.tx = tx;
    }

    @GetMapping("/dashboard")
    public AdminDtos.Dashboard dashboard() {
        CurrentUser.requireRole(Role.ADMIN);
        return dashboardService.dashboard();
    }

    @GetMapping("/audit")
    public PageResponse<AuditEventView> audit(
            @RequestParam(required = false) String actor, @RequestParam(required = false) String action,
            @RequestParam(required = false) String outcome, @RequestParam(required = false) UUID documentId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "50") int size) {
        CurrentUser.requireRole(Role.ADMIN);
        return auditQuery.search(new AuditQueryService.Filter(actor, action, outcome, documentId, from, to), page, size);
    }

    @GetMapping("/audit/actions")
    public List<String> actions() {
        CurrentUser.requireRole(Role.ADMIN);
        return Arrays.stream(AuditAction.values()).map(Enum::name).sorted().toList();
    }

    @GetMapping("/audit/export")
    public void export(
            @RequestParam(required = false) String actor, @RequestParam(required = false) String action,
            @RequestParam(required = false) String outcome, @RequestParam(required = false) UUID documentId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            HttpServletResponse response) throws IOException {
        CurrentUser.requireRole(Role.ADMIN);
        var filter = new AuditQueryService.Filter(actor, action, outcome, documentId, from, to);
        // Validate filters before committing to a 200 response.
        auditQuery.search(filter, 0, 1);
        tx.executeWithoutResult(s -> audit.record(AuditEntry.of(AuditAction.AUDIT_EXPORTED).target("AUDIT", null)
                .detail("actor", actor).detail("action", action).detail("outcome", outcome)
                .detail("documentId", documentId == null ? null : documentId.toString())
                .detail("from", from == null ? null : from.toString()).detail("to", to == null ? null : to.toString())));
        response.setContentType("text/csv;charset=UTF-8");
        response.setHeader("Content-Disposition", "attachment; filename=\"trustvault-audit.csv\"");
        response.setHeader("Cache-Control", "no-store");
        Writer writer = new OutputStreamWriter(response.getOutputStream(), StandardCharsets.UTF_8);
        auditQuery.exportCsv(filter, writer);
        writer.flush();
    }

    @GetMapping("/audit/verify")
    public IntegrityReport verify() {
        CurrentUser.requireRole(Role.ADMIN);
        IntegrityReport report = integrity.verify();
        tx.executeWithoutResult(s -> audit.record(AuditEntry.of(AuditAction.AUDIT_VERIFIED).target("AUDIT", null)
                .detail("valid", report.valid()).detail("checkedEvents", report.checkedEvents())
                .detail("headSeq", report.headSeq()).detail("headHash", report.headHash())));
        return report;
    }

    @GetMapping("/users")
    public List<AdminDtos.AdminUser> users() {
        CurrentUser.requireRole(Role.ADMIN);
        return userService.list();
    }

    @PostMapping("/users")
    @ResponseStatus(HttpStatus.CREATED)
    public AdminDtos.AdminUser create(@Valid @RequestBody AdminDtos.CreateUserRequest request) {
        CurrentUser.requireRole(Role.ADMIN);
        return userService.create(request);
    }

    @PatchMapping("/users/{id}")
    public AdminDtos.AdminUser update(@PathVariable UUID id, @Valid @RequestBody AdminDtos.UpdateUserRequest request) {
        return userService.update(CurrentUser.requireRole(Role.ADMIN), id, request);
    }

    @PostMapping("/users/{id}/reset-password")
    public ResponseEntity<Void> resetPassword(@PathVariable UUID id,
                                              @Valid @RequestBody AdminDtos.ResetPasswordRequest request) {
        userService.resetPassword(CurrentUser.requireRole(Role.ADMIN), id, request.temporaryPassword());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/users/{id}/revoke-sessions")
    public ResponseEntity<Void> revokeSessions(@PathVariable UUID id) {
        CurrentUser.requireRole(Role.ADMIN);
        userService.revokeSessions(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/users/{id}/transfer-documents")
    public AdminDtos.TransferResult transfer(@PathVariable UUID id, @Valid @RequestBody AdminDtos.TransferRequest request) {
        CurrentUser.requireRole(Role.ADMIN);
        return userService.transferDocuments(id, request.toUserId());
    }
}
