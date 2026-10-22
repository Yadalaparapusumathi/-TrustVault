package com.trustvault.storage;

public record ValidatedFile(byte[] bytes, String filename, String contentType, String sha256) {
}
