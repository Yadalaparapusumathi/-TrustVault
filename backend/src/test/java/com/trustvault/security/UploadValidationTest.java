package com.trustvault.security;

import com.trustvault.support.IntegrationTest;
import com.trustvault.user.Role;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.mock.web.MockHttpServletResponse;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/** T-40..T-47: only expected, inert file types get in; what goes out is always a download, never a rendered page. */
class UploadValidationTest extends IntegrationTest {

    private Actor owner;

    @BeforeEach
    void setUp() {
        owner = actor(Role.OWNER);
    }

    static Stream<Arguments> hostileFiles() throws Exception {
        return Stream.of(
                Arguments.of("Windows executable renamed to .pdf", "invoice.pdf", bytes("MZ\u0090\u0000\u0003 This program cannot be run in DOS mode")),
                Arguments.of("HTML disguised as text", "readme.txt", bytes("<html><script>alert(document.cookie)</script></html>")),
                Arguments.of("SVG (scriptable image)", "logo.svg", bytes("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>")),
                Arguments.of("HTML file", "page.html", bytes("<html></html>")),
                Arguments.of("Executable extension", "setup.exe", bytes("MZ")),
                Arguments.of("No extension", "README", bytes("hello")),
                Arguments.of("Double extension", "report.pdf.exe", bytes("MZ")),
                Arguments.of("PDF with JavaScript", "form.pdf", pdf("/OpenAction << /S /JavaScript /JS (app.alert(1)) >>")),
                Arguments.of("PDF with hex-escaped JavaScript name", "form2.pdf", pdf("/OpenAction << /S /Java#53cript /JS (x) >>")),
                Arguments.of("PDF with Launch action", "launch.pdf", pdf("/OpenAction << /S /Launch /F (cmd.exe) >>")),
                Arguments.of("PDF with embedded file", "embed.pdf", pdf("/Names << /EmbeddedFiles 9 0 R >>")),
                Arguments.of("Word document with macros", "macro.docx", ooxml("word/document.xml", "word/vbaProject.bin")),
                Arguments.of("Zip pretending to be a Word document", "fake.docx", ooxml("payload.exe")),
                Arguments.of("Text with NUL bytes (binary smuggling)", "notes.txt", new byte[]{'a', 0, 'b', '\n'}),
                Arguments.of("Text that is not UTF-8", "notes.txt", new byte[]{(byte) 0xC3, (byte) 0x28, '\n'}),
                Arguments.of("PNG extension with JPEG body", "photo.png", new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 0x10, 'J', 'F', 'I', 'F', 0}),
                Arguments.of("Empty file", "empty.txt", new byte[0]));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("hostileFiles")
    @DisplayName("Hostile or mislabelled files are rejected, and the rejection is audited")
    void rejectsHostileFiles(String label, String filename, byte[] content) throws Exception {
        String name = "Upload " + UUID.randomUUID();
        int before = countAudit("UPLOAD_REJECTED", "FAILURE", owner.id(), null)
                + countAudit("UPLOAD_REJECTED", "DENIED", owner.id(), null);
        MockHttpServletResponse response = perform(owner, uploadRequest(name, "Test", filename, content)).getResponse();

        assertThat(response.getStatus()).as(label).isIn(400, 415);
        assertThat(body(perform(owner, get("/api/documents").param("q", name))).get("totalElements").asInt())
                .isZero();
        assertThat(countAudit("UPLOAD_REJECTED", "FAILURE", owner.id(), null)
                + countAudit("UPLOAD_REJECTED", "DENIED", owner.id(), null)).as(label).isEqualTo(before + 1);
    }

    @Test
    @DisplayName("Valid PDF, DOCX, CSV and text uploads are accepted")
    void acceptsLegitimateFiles() throws Exception {
        upload(owner, "Pdf", "Test", "ok.pdf", pdf("/Type /Catalog"));
        upload(owner, "Docx", "Test", "ok.docx", ooxml("word/document.xml"));
        upload(owner, "Csv", "Test", "ok.csv", bytes("a,b\n1,2\n"));
        upload(owner, "Txt", "Test", "ok.txt", bytes("plain notes\n"));
    }

    @Test
    @DisplayName("Path traversal and control characters in filenames are stripped")
    void filenameIsSanitised() throws Exception {
        UUID doc = upload(owner, "Traversal", "Test", "../../etc/pa\r\nss\u0000wd.txt", bytes("x\n"));
        String disposition = perform(owner, get("/api/documents/{id}/content", doc)).getResponse()
                .getHeader("Content-Disposition");
        assertThat(disposition).startsWith("attachment").doesNotContain("..").doesNotContain("/")
                .doesNotContain("\r").doesNotContain("\n");
    }

    @Test
    @DisplayName("Downloads are attachments with nosniff, a sandbox CSP and no caching")
    void downloadHeaders() throws Exception {
        UUID doc = upload(owner, "Headers", "Test", "h.txt", bytes("hello\n"));
        MockHttpServletResponse response = perform(owner, get("/api/documents/{id}/content", doc)).getResponse();
        assertThat(response.getHeader("Content-Disposition")).startsWith("attachment");
        assertThat(response.getHeader("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(response.getHeader("Content-Security-Policy")).contains("sandbox").contains("default-src 'none'");
        assertThat(response.getHeader("Cache-Control")).contains("no-store");
    }

    @Test
    @DisplayName("Stored content is encrypted at rest: the plaintext never appears in the database")
    void contentIsEncryptedAtRest() throws Exception {
        String marker = "TOP-SECRET-MARKER-" + UUID.randomUUID();
        UUID doc = upload(owner, "Encrypted", "Test", "secret.txt", bytes(marker + "\n"));
        byte[] stored = appJdbc.queryForObject("""
                select b.ciphertext from document_blobs b join document_versions v on v.id = b.version_id
                 where v.document_id = ?""", byte[].class, doc);
        assertThat(new String(stored, StandardCharsets.ISO_8859_1)).doesNotContain(marker);
        assertThat(perform(owner, get("/api/documents/{id}/content", doc)).getResponse().getContentAsString())
                .contains(marker);
    }

    @Test
    @DisplayName("Ciphertext moved to another document's row does not decrypt (bound to document and version)")
    void ciphertextIsBoundToItsDocument() throws Exception {
        Actor attacker = actor(Role.OWNER);
        UUID victim = upload(owner, "Victim", "Test", "v.txt", bytes("victim secret\n"));
        UUID mine = upload(attacker, "Mine", "Test", "m.txt", bytes("mine\n"));
        superuserJdbc().update("""
                update document_versions set wrapped_key = (select wrapped_key from document_versions where document_id = ?)
                 where document_id = ?""", victim, mine);
        superuserJdbc().update("""
                update document_blobs set ciphertext = (select b.ciphertext from document_blobs b
                  join document_versions v on v.id = b.version_id where v.document_id = ?)
                 where version_id = (select id from document_versions where document_id = ?)""", victim, mine);

        MockHttpServletResponse response = perform(attacker, get("/api/documents/{id}/content", mine)).getResponse();
        assertThat(response.getStatus()).isEqualTo(500);
        assertThat(response.getContentAsString()).doesNotContain("victim secret");
    }

    private static byte[] bytes(String s) {
        return s.getBytes(StandardCharsets.UTF_8);
    }

    private static byte[] pdf(String body) {
        return bytes("%PDF-1.4\n1 0 obj\n<< /Type /Catalog " + body + " >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");
    }

    private static byte[] ooxml(String... parts) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out)) {
            zip.putNextEntry(new ZipEntry("[Content_Types].xml"));
            zip.write(bytes("<?xml version=\"1.0\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">"
                    + "<Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>"));
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry("_rels/.rels"));
            zip.write(bytes("<?xml version=\"1.0\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"/>"));
            zip.closeEntry();
            for (String part : parts) {
                zip.putNextEntry(new ZipEntry(part));
                zip.write(bytes("<x/>"));
                zip.closeEntry();
            }
        }
        return out.toByteArray();
    }
}
