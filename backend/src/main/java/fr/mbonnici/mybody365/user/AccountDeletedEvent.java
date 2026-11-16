package fr.mbonnici.mybody365.user;

import java.util.UUID;

/** Published when an account is deleted: what lives outside the database (pictures) goes after the commit. */
public record AccountDeletedEvent(UUID userId) {}
