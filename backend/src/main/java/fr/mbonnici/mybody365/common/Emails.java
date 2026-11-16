package fr.mbonnici.mybody365.common;

import java.util.Locale;

public final class Emails {

    private Emails() {}

    /** The canonical form every e-mail is stored and compared in. */
    public static String normalize(String email) {
        return email == null ? null : email.trim().toLowerCase(Locale.ROOT);
    }
}
