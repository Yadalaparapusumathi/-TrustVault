package com.trustvault.user;

import com.trustvault.common.Like;
import jakarta.validation.constraints.Size;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** People search used when sharing. URL rules restrict it to OWNER and ADMIN (see SecurityConfig). */
@RestController
@RequestMapping("/api/users")
@Validated
public class DirectoryController {

    private final UserRepository users;

    public DirectoryController(UserRepository users) {
        this.users = users;
    }

    @GetMapping("/directory")
    @Transactional(readOnly = true)
    public List<UserSummary> directory(@RequestParam(defaultValue = "") @Size(max = 64) String q) {
        return users.searchActive(Like.contains(q), PageRequest.of(0, 20)).stream().map(UserSummary::of).toList();
    }
}
