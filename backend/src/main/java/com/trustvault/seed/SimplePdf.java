package com.trustvault.seed;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/** Minimal, valid single-page PDF with Helvetica text. Used only to produce realistic seed documents. */
final class SimplePdf {

    private SimplePdf() {
    }

    static byte[] of(String title, List<String> lines) {
        StringBuilder content = new StringBuilder("BT\n/F1 18 Tf\n56 780 Td\n(").append(escape(title)).append(") Tj\n");
        content.append("/F1 11 Tf\n0 -28 Td\n");
        for (String line : lines) {
            content.append("(").append(escape(line)).append(") Tj\n0 -16 Td\n");
        }
        content.append("ET\n");
        byte[] stream = content.toString().getBytes(StandardCharsets.ISO_8859_1);

        List<String> objects = new ArrayList<>();
        objects.add("<< /Type /Catalog /Pages 2 0 R >>");
        objects.add("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
        objects.add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>");
        objects.add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
        objects.add("<< /Length " + stream.length + " >>\nstream\n" + new String(stream, StandardCharsets.ISO_8859_1) + "endstream");

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        write(out, "%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n");
        List<Integer> offsets = new ArrayList<>();
        for (int i = 0; i < objects.size(); i++) {
            offsets.add(out.size());
            write(out, (i + 1) + " 0 obj\n" + objects.get(i) + "\nendobj\n");
        }
        int xref = out.size();
        StringBuilder trailer = new StringBuilder("xref\n0 ").append(objects.size() + 1).append("\n0000000000 65535 f \n");
        for (int offset : offsets) {
            trailer.append(String.format("%010d 00000 n \n", offset));
        }
        trailer.append("trailer\n<< /Size ").append(objects.size() + 1).append(" /Root 1 0 R >>\nstartxref\n")
                .append(xref).append("\n%%EOF\n");
        write(out, trailer.toString());
        return out.toByteArray();
    }

    private static String escape(String s) {
        return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)");
    }

    private static void write(ByteArrayOutputStream out, String s) {
        out.writeBytes(s.getBytes(StandardCharsets.ISO_8859_1));
    }
}
