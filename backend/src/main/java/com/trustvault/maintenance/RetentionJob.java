package com.trustvault.maintenance;

import com.trustvault.document.DocumentRepository;
import com.trustvault.document.DocumentService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.util.UUID;

/** Permanently removes documents that have sat in the trash past the retention period. Audited as the system. */
@Component
public class RetentionJob {

    private static final Logger log = LoggerFactory.getLogger(RetentionJob.class);

    private final DocumentRepository documents;
    private final DocumentService documentService;
    private final TransactionTemplate tx;
    private final Clock clock;

    public RetentionJob(DocumentRepository documents, DocumentService documentService, TransactionTemplate tx,
                        Clock clock) {
        this.documents = documents;
        this.documentService = documentService;
        this.tx = tx;
        this.clock = clock;
    }

    @Scheduled(cron = "${trustvault.retention.purge-cron}", zone = "UTC")
    public void purgeExpiredTrash() {
        int purged = 0;
        for (UUID id : documents.findDueForPurge(clock.instant())) {
            try {
                tx.executeWithoutResult(s -> documents.findById(id)
                        .filter(d -> d.isDeleted() && d.getPurgeAfter() != null && d.getPurgeAfter().isBefore(clock.instant()))
                        .ifPresent(d -> documentService.purgeNow(d, "retention")));
                purged++;
            } catch (RuntimeException e) {
                log.error("Retention purge failed for document {}", id, e);
            }
        }
        if (purged > 0) {
            log.info("Retention purge removed {} document(s)", purged);
        }
    }
}
