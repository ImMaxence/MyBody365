package fr.mbonnici.mybody365.storage;

import fr.mbonnici.mybody365.user.AccountDeletedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/** A deleted account takes its pictures with it, once the deletion is committed. */
@Component
public class StorageCleanup {

    private static final Logger log = LoggerFactory.getLogger(StorageCleanup.class);

    private final ObjectStorage storage;

    public StorageCleanup(ObjectStorage storage) {
        this.storage = storage;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onAccountDeleted(AccountDeletedEvent event) {
        try {
            int n = storage.deletePrefix(ObjectStorage.userPrefix(event.userId()));
            log.info("Deleted {} stored file(s) of a deleted account", n);
        } catch (RuntimeException e) {
            log.error("Could not delete the stored files of a deleted account {}", event.userId(), e);
        }
    }
}
