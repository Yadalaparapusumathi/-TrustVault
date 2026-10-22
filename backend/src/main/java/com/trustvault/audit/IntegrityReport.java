package com.trustvault.audit;

import java.time.Instant;

public record IntegrityReport(boolean valid, long checkedEvents, Long firstBrokenSeq, Long headSeq, String headHash,
                              Instant verifiedAt, String message) {
}
