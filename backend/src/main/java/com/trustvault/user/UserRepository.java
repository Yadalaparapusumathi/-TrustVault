package com.trustvault.user;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {

    @Query("select u from User u where lower(u.username) = lower(:username)")
    Optional<User> findByUsernameIgnoreCase(@Param("username") String username);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where lower(u.username) = lower(:username)")
    Optional<User> lockByUsername(@Param("username") String username);

    @Query("""
            select u from User u
            where u.active = true
              and (lower(u.username) like :pattern escape '\\' or lower(u.displayName) like :pattern escape '\\')
            order by u.displayName
            """)
    List<User> searchActive(@Param("pattern") String pattern, Pageable pageable);

    List<User> findByDeletedAtIsNullOrderByDisplayNameAsc();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.id in :ids order by u.id")
    List<User> lockByIds(@Param("ids") List<UUID> ids);

    long countByActiveTrue();

    long countByDeletedAtIsNull();

    long countByRoleAndActiveTrue(Role role);
}
