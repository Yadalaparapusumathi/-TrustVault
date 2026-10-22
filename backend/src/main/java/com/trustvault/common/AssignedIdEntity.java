package com.trustvault.common;

import jakarta.persistence.MappedSuperclass;
import jakarta.persistence.PostLoad;
import jakarta.persistence.PostPersist;
import jakarta.persistence.Transient;
import org.springframework.data.domain.Persistable;

import java.util.UUID;

/**
 * Entities whose UUID is assigned in code. Without this, Spring Data sees a non-null id, assumes the row exists and
 * calls merge(), which costs a SELECT and hands back a different instance than the one the caller holds.
 */
@MappedSuperclass
public abstract class AssignedIdEntity implements Persistable<UUID> {

    @Transient
    private boolean fresh = true;

    @Override
    public boolean isNew() {
        return fresh;
    }

    @PostPersist
    @PostLoad
    void markPersisted() {
        fresh = false;
    }
}
