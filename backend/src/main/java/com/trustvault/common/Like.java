package com.trustvault.common;

import java.util.Locale;

/** Turns user input into a safe, case-insensitive "contains" LIKE pattern (escape character is backslash). */
public final class Like {

    private Like() {
    }

    public static String contains(String raw) {
        String escaped = raw.trim().toLowerCase(Locale.ROOT)
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
        return "%" + escaped + "%";
    }
}
