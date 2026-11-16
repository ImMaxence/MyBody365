package fr.mbonnici.mybody365.common;

import java.time.Instant;
import java.util.Map;

/** Uniform JSON error body. {@code message} is a stable code the app translates (e.g. "email_taken"). */
public record ApiError(int status, String error, String message, Map<String, String> fields, String path, Instant timestamp) {}
