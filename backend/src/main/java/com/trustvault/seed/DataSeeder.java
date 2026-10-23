package com.trustvault.seed;

import com.trustvault.audit.AuditAction;
import com.trustvault.audit.AuditEntry;
import com.trustvault.audit.AuditService;
import com.trustvault.config.AppProperties;
import com.trustvault.user.Role;
import com.trustvault.user.User;
import com.trustvault.user.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;

/** Bootstraps only the administrator on an empty database; never changes existing accounts. */
@Component
public class DataSeeder {

    private static final Logger log = LoggerFactory.getLogger(DataSeeder.class);
    private final AppProperties properties;
    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final AuditService audit;
    private final TransactionTemplate tx;
    private final Clock clock;

    public DataSeeder(AppProperties properties, UserRepository users, PasswordEncoder encoder,
                      AuditService audit, TransactionTemplate tx, Clock clock) {
        this.properties = properties;
        this.users = users;
        this.encoder = encoder;
        this.audit = audit;
        this.tx = tx;
        this.clock = clock;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void seed() {
        AppProperties.Seed seed = properties.seed();
        if (!seed.enabled()) {
            return;
        }
        tx.executeWithoutResult(s -> {
            if (users.count() > 0) {
                return;
            }
            if (seed.passwordAdmin() == null || seed.passwordAdmin().isBlank()) {
                throw new IllegalStateException("Seeding is enabled but TV_SEED_PASSWORD_ADMIN is not set");
            }
            User admin = new User("admin", "Administrator", null, encoder.encode(seed.passwordAdmin()),
                    Role.ADMIN, clock.instant());
            users.saveAndFlush(admin);
            audit.record(AuditEntry.of(AuditAction.USER_CREATED).systemActor().target("USER", admin.getId())
                    .detail("username", admin.getUsername()).detail("role", Role.ADMIN)
                    .detail("reason", "administrator-bootstrap"));
        });
        log.info("Administrator bootstrap complete; existing accounts are unchanged");
    }
}
