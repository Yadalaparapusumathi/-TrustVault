package com.trustvault.document;

import com.trustvault.common.ApiException;

import java.text.Normalizer;
import java.util.regex.Pattern;

/** Normalises and validates user-entered document metadata. */
final class MetadataRules {

    private static final Pattern CATEGORY = Pattern.compile("^[\\p{L}\\p{N}][\\p{L}\\p{N} &._-]{0,49}$");

    private MetadataRules() {
    }

    static String name(String raw) {
        String value = clean(raw);
        if (value == null || value.isEmpty()) {
            throw ApiException.badRequest("Name is required");
        }
        if (value.length() > 200) {
            throw ApiException.badRequest("Name must be at most 200 characters");
        }
        return value;
    }

    static String description(String raw) {
        if (raw == null) {
            return null;
        }
        String value = Normalizer.normalize(raw, Normalizer.Form.NFC).replaceAll("[\\p{Cntrl}&&[^\\n\\t]]", "").strip();
        if (value.length() > 2000) {
            throw ApiException.badRequest("Description must be at most 2000 characters");
        }
        return value.isEmpty() ? null : value;
    }

    static String category(String raw) {
        String value = clean(raw);
        if (value == null || !CATEGORY.matcher(value).matches()) {
            throw ApiException.badRequest(
                    "Category is required: up to 50 letters, digits, spaces and & . _ -, starting with a letter or digit");
        }
        return value;
    }

    private static String clean(String raw) {
        if (raw == null) {
            return null;
        }
        return Normalizer.normalize(raw, Normalizer.Form.NFC).replaceAll("[\\p{Cntrl}\\p{Cf}]", "")
                .replaceAll("\\s+", " ").strip();
    }
}
