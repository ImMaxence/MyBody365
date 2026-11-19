package fr.mbonnici.mybody365.admin;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 1.13: « Statistiques »: what the project takes on the server (storage, memory, processor) and its last 24 hours. */
@RestController
@RequestMapping("/api/admin/stats")
public class AdminStatsController {

    private final ServerStats stats;

    public AdminStatsController(ServerStats stats) {
        this.stats = stats;
    }

    @GetMapping
    public ServerStats.StatsDto stats() {
        return stats.stats();
    }
}
