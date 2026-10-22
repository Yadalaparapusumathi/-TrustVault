package com.trustvault.seed;

import com.trustvault.auth.AuthService;
import com.trustvault.common.ApiException;
import com.trustvault.config.AppProperties;
import com.trustvault.document.Classification;
import com.trustvault.document.DocumentDtos;
import com.trustvault.document.DocumentService;
import com.trustvault.document.GrantService;
import com.trustvault.document.Permission;
import com.trustvault.security.AuthenticatedUser;
import com.trustvault.user.Role;
import com.trustvault.user.User;
import com.trustvault.user.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * Demo data for a fresh database (trustvault.seed.enabled=true and no users yet). Everything is created through the
 * real services while impersonating the acting user, so the audit trail it leaves is genuine and chain-valid.
 */
@Component
public class DataSeeder {

    private static final Logger log = LoggerFactory.getLogger(DataSeeder.class);

    private final AppProperties properties;
    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final DocumentService documents;
    private final GrantService grants;
    private final AuthService authService;
    private final TransactionTemplate tx;
    private final Clock clock;

    public DataSeeder(AppProperties properties, UserRepository users, PasswordEncoder encoder,
                      DocumentService documents, GrantService grants, AuthService authService, TransactionTemplate tx,
                      Clock clock) {
        this.properties = properties;
        this.users = users;
        this.encoder = encoder;
        this.documents = documents;
        this.grants = grants;
        this.authService = authService;
        this.tx = tx;
        this.clock = clock;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void seed() {
        AppProperties.Seed seed = properties.seed();
        if (!seed.enabled() || users.count() > 0) {
            return;
        }
        if (isBlank(seed.passwordAdmin()) || isBlank(seed.passwordOwner()) || isBlank(seed.passwordViewer())) {
            throw new IllegalStateException("Seeding is enabled but TV_SEED_PASSWORD_ADMIN/OWNER/VIEWER are not all set");
        }
        log.info("Seeding demo data");
        Map<String, User> u = new LinkedHashMap<>();
        tx.executeWithoutResult(s -> {
            u.put("admin", user("admin", "Morgan Reyes", "morgan.reyes@trustvault.example", Role.ADMIN, seed.passwordAdmin()));
            u.put("alice", user("alice", "Alice Chen", "alice.chen@trustvault.example", Role.OWNER, seed.passwordOwner()));
            u.put("bob", user("bob", "Bob Martins", "bob.martins@trustvault.example", Role.OWNER, seed.passwordOwner()));
            u.put("erin", user("erin", "Erin Walsh", "erin.walsh@trustvault.example", Role.OWNER, seed.passwordOwner()));
            u.put("carol", user("carol", "Carol Diaz", "carol.diaz@trustvault.example", Role.VIEWER, seed.passwordViewer()));
            u.put("dave", user("dave", "Dave Okafor (Northbridge Audit)", "dave@northbridge-audit.example", Role.VIEWER, seed.passwordViewer()));
            u.put("frank", user("frank", "Frank Li (Acme Partners)", "frank.li@acme-partners.example", Role.VIEWER, seed.passwordViewer()));
        });

        UUID salary = upload(u.get("alice"), "Salary letter - Carol Diaz 2026", "HR", Classification.RESTRICTED,
                "Annual compensation statement.", pdf("salary-letter-carol-diaz-2026.pdf", "Salary letter",
                        "Dear Carol,", "Your base salary from 1 January 2026 is EUR 78,400.",
                        "This letter is confidential and addressed to you only.", "Alice Chen, People Team"));
        UUID handbook = upload(u.get("alice"), "Employee handbook 2026", "HR", Classification.INTERNAL,
                "Policies every employee should know.", pdf("employee-handbook-2026.pdf", "Employee handbook 2026",
                        "1. Working hours", "2. Leave and absence", "3. Information security", "4. Code of conduct"));
        UUID payroll = upload(u.get("alice"), "Payroll summary Q3 2026", "Finance", Classification.RESTRICTED,
                "Aggregated payroll for the Q3 audit.", new BytesMultipartFile("payroll-summary-q3-2026.csv",
                        ("department,headcount,gross_total_eur\nEngineering,42,1210400\nSales,18,498200\n"
                                + "People,6,151900\nFinance,7,203350\n").getBytes(StandardCharsets.UTF_8)));
        UUID evidence = upload(u.get("alice"), "Audit evidence pack FY2026", "Audit", Classification.CONFIDENTIAL,
                "Evidence requested by Northbridge Audit.", pdf("audit-evidence-fy2026.pdf", "Audit evidence pack FY2026",
                        "Index of evidence", "A. Access reviews", "B. Joiner / mover / leaver records", "C. Payroll reconciliation"));
        UUID msa = upload(u.get("bob"), "Master services agreement - Globex", "Contracts", Classification.CONFIDENTIAL,
                "Signed MSA with Globex Corporation.", pdf("msa-globex.pdf", "Master Services Agreement",
                        "Between TrustVault Ltd and Globex Corporation", "Term: 36 months", "Liability cap: 12 months of fees"));
        upload(u.get("bob"), "Pricing proposal - Initech", "Contracts", Classification.CONFIDENTIAL,
                "Draft pricing, not yet sent.", pdf("pricing-initech.pdf", "Pricing proposal - Initech",
                        "Enterprise tier: EUR 96,000 per year", "Discount ceiling: 18%"));
        UUID drawing = upload(u.get("erin"), "Bridge assembly drawing rev C", "Engineering", Classification.CONFIDENTIAL,
                "Assembly drawing shared with Acme Partners for fabrication.", pdf("bridge-assembly-rev-c.pdf",
                        "Bridge assembly drawing - rev C", "Part list: B-100 to B-148", "Tolerance class: ISO 2768-m"));
        UUID spec = upload(u.get("erin"), "Partner integration spec", "Engineering", Classification.INTERNAL,
                "Integration notes for Acme Partners.", new BytesMultipartFile("partner-integration-spec.txt",
                        ("Partner integration spec\n========================\n\n1. Exchange format: CSV over SFTP\n"
                                + "2. Schedule: nightly at 02:00 UTC\n3. Contact: erin.walsh@trustvault.example\n")
                                .getBytes(StandardCharsets.UTF_8)));

        grant(u.get("alice"), salary, u.get("carol"), Permission.READ, null);
        grant(u.get("alice"), handbook, u.get("carol"), Permission.READ, null);
        grant(u.get("alice"), handbook, u.get("bob"), Permission.READ, null);
        grant(u.get("alice"), handbook, u.get("erin"), Permission.READ, null);
        grant(u.get("alice"), payroll, u.get("dave"), Permission.READ, Duration.ofDays(30));
        grant(u.get("alice"), evidence, u.get("dave"), Permission.READ, Duration.ofDays(30));
        grant(u.get("bob"), msa, u.get("alice"), Permission.EDIT, null);
        grant(u.get("erin"), drawing, u.get("frank"), Permission.READ, null);
        grant(u.get("erin"), spec, u.get("frank"), Permission.EDIT, null);

        // Some realistic history: a share that was taken back, reads, and a refused attempt.
        DocumentDtos.GrantView mistaken = as(u.get("bob"), () -> grants.grant(current(), msa,
                new DocumentDtos.GrantRequest(u.get("carol").getId(), Permission.READ, null, null))).grant();
        as(u.get("bob"), () -> {
            grants.revoke(current(), msa, mistaken.id());
            return null;
        });
        as(u.get("carol"), () -> documents.download(current(), salary, null));
        as(u.get("dave"), () -> documents.download(current(), payroll, null));
        as(u.get("frank"), () -> documents.download(current(), drawing, null));
        try {
            as(u.get("frank"), () -> documents.download(current(), msa, null));
        } catch (ApiException expected) {
            // recorded as ACCESS_DENIED
        }
        authService.login("carol", "not-her-password", "203.0.113.7", "seed");
        log.info("Seed complete: {} users, 8 documents", u.size());
    }

    private User user(String username, String name, String email, Role role, String password) {
        User user = new User(username, name, email, encoder.encode(password), role, clock.instant());
        return users.save(user);
    }

    private UUID upload(User owner, String name, String category, Classification classification, String description,
                        BytesMultipartFile file) {
        return as(owner, () -> documents.upload(current(), file, name, description, category, classification)).id();
    }

    private void grant(User owner, UUID doc, User grantee, Permission permission, Duration expiresIn) {
        as(owner, () -> grants.grant(current(), doc, new DocumentDtos.GrantRequest(grantee.getId(), permission,
                expiresIn == null ? null : clock.instant().plus(expiresIn), null)));
    }

    private static BytesMultipartFile pdf(String filename, String title, String... lines) {
        return new BytesMultipartFile(filename, SimplePdf.of(title, List.of(lines)));
    }

    private <T> T as(User user, Supplier<T> action) {
        AuthenticatedUser principal = new AuthenticatedUser(user.getId(), user.getUsername(), user.getDisplayName(),
                user.getRole(), false, UUID.randomUUID());
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(principal, null,
                List.of(new SimpleGrantedAuthority(user.getRole().authority()))));
        try {
            return action.get();
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    private static AuthenticatedUser current() {
        return com.trustvault.security.CurrentUser.require();
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
