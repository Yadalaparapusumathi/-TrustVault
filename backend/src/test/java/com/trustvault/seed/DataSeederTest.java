package com.trustvault.seed;

import com.trustvault.audit.AuditService;
import com.trustvault.config.AppProperties;
import com.trustvault.support.IntegrationTest;
import com.trustvault.user.Role;
import com.trustvault.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.AdditionalAnswers.delegatesTo;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DataSeederTest extends IntegrationTest {

    @Autowired AuditService audit;
    @Autowired TransactionTemplate tx;
    @Autowired Clock clock;

    @Test
    void bootstrapCreatesOnlyAdminAndNeverResetsExistingAccounts() {
        // The shared integration database contains other tests' fixtures: simulate eligibility without deleting them.
        UserRepository eligible = mock(UserRepository.class, delegatesTo(users));
        doReturn(0L).when(eligible).count();
        AppProperties properties = mock(AppProperties.class);
        when(properties.seed()).thenReturn(new AppProperties.Seed(true, PASSWORD));
        long before = users.count();
        long documents = appJdbc.queryForObject("select count(*) from documents", Long.class);
        new DataSeeder(properties, eligible, encoder, audit, tx, clock).seed();
        assertThat(users.count()).isEqualTo(before + 1);
        assertThat(appJdbc.queryForObject("select count(*) from documents", Long.class)).isEqualTo(documents);
        var admin = users.findByUsernameIgnoreCase("admin").orElseThrow();
        assertThat(admin.getRole()).isEqualTo(Role.ADMIN);
        assertThat(encoder.matches(PASSWORD, admin.getPasswordHash())).isTrue();
        assertThat(appJdbc.queryForObject(
                "select count(*) from audit_events where action = 'USER_CREATED' and target_id = ?",
                Integer.class, admin.getId().toString())).isEqualTo(1);

        when(properties.seed()).thenReturn(new AppProperties.Seed(true, "Different-password-123"));
        new DataSeeder(properties, users, encoder, audit, tx, clock).seed();
        assertThat(users.count()).isEqualTo(before + 1);
        assertThat(users.findById(admin.getId()).orElseThrow().getPasswordHash()).isEqualTo(admin.getPasswordHash());
    }

    @Test
    void disabledBootstrapDoesNothingAndEnabledBootstrapRequiresAdminPassword() {
        UserRepository eligible = mock(UserRepository.class, delegatesTo(users));
        doReturn(0L).when(eligible).count();
        AppProperties properties = mock(AppProperties.class);
        long before = users.count();
        when(properties.seed()).thenReturn(new AppProperties.Seed(false, ""));
        var seeder = new DataSeeder(properties, eligible, encoder, audit, tx, clock);
        seeder.seed();
        assertThat(users.count()).isEqualTo(before);
        when(properties.seed()).thenReturn(new AppProperties.Seed(true, ""));
        assertThatThrownBy(seeder::seed).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("TV_SEED_PASSWORD_ADMIN");
        assertThat(users.count()).isEqualTo(before);
    }
}
