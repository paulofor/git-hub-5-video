package com.aihub.hub.github;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.spec.InvalidKeySpecException;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

@Component
public class GithubAppAuth {

    private static final Logger log = LoggerFactory.getLogger(GithubAppAuth.class);

    private final RestClient githubRestClient;
    private final Clock clock;
    private final String appId;
    private final String privateKeyPem;
    private final String privateKeyPath;
    private final long installationId;

    private final AtomicReference<String> cachedPrivateKeyPem = new AtomicReference<>();
    private final AtomicReference<CachedToken> cachedToken = new AtomicReference<>();

    public GithubAppAuth(RestClient githubRestClient,
                         Clock clock,
                         @Value("${hub.github.app-id}") String appId,
                         @Value("${hub.github.private-key:${GITHUB_PRIVATE_KEY_PEM:}}") String privateKeyPem,
                         @Value("${hub.github.private-key-file:${GITHUB_PRIVATE_KEY_FILE:}}") String privateKeyPath,
                         @Value("${hub.github.installation-id:}") String installationId) {
        this.githubRestClient = githubRestClient;
        this.clock = clock;
        this.appId = appId;
        this.privateKeyPem = privateKeyPem;
        this.privateKeyPath = privateKeyPath;
        this.installationId = parseInstallationId(installationId);
    }

    private long parseInstallationId(String installationId) {
        if (installationId == null) {
            return 0L;
        }
        String trimmed = installationId.trim();
        if (trimmed.isEmpty()) {
            return 0L;
        }
        try {
            return Long.parseLong(trimmed);
        } catch (NumberFormatException e) {
            throw new IllegalStateException("GitHub installation id must be numeric", e);
        }
    }

    public String createJwt() {
        String pem = requirePrivateKeyPem();

        log.info("Generating GitHub App JWT. appId={}, installationId={}, privateKeyConfigured={}, privateKeyLength={} chars",
            maskedAppId(), describeInstallationId(), true, privateKeyLength(pem));

        try {
            Instant now = clock.instant();
            String headerJson = "{\"typ\":\"JWT\",\"alg\":\"RS256\"}";
            String header = Base64.getUrlEncoder().withoutPadding().encodeToString(headerJson.getBytes(StandardCharsets.UTF_8));
            long issuedAt = now.minusSeconds(30).getEpochSecond();
            long expiresAt = now.plus(9, ChronoUnit.MINUTES).getEpochSecond();
            String payload = String.format("{\"iat\":%d,\"exp\":%d,\"iss\":\"%s\"}", issuedAt, expiresAt, appId);
            String payloadB64 = Base64.getUrlEncoder().withoutPadding().encodeToString(payload.getBytes(StandardCharsets.UTF_8));
            String signingInput = header + "." + payloadB64;
            byte[] signature = sign(signingInput.getBytes(StandardCharsets.UTF_8), pem);
            return signingInput + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(signature);
        } catch (Exception e) {
            log.error("Unable to generate GitHub App JWT. appId={}, installationId={}, privateKeyConfigured={}, privateKeyLength={} chars",
                maskedAppId(), describeInstallationId(), true, privateKeyLength(pem), e);
            throw new IllegalStateException("Unable to generate GitHub App JWT", e);
        }
    }

    public String getInstallationToken() {
        CachedToken token = cachedToken.get();
        if (token != null && token.expiresAt.isAfter(clock.instant().plusSeconds(60))) {
            return token.token;
        }
        if (installationId <= 0) {
            throw new IllegalStateException("GitHub installation id is required");
        }
        log.info("Requesting GitHub installation token. appId={}, installationId={}.", maskedAppId(), describeInstallationId());

        try {
            String jwt = createJwt();
            JsonNode response = githubRestClient.post()
                .uri("/app/installations/{id}/access_tokens", installationId)
                .header("Authorization", "Bearer " + jwt)
                .header("Accept", "application/vnd.github+json")
                .retrieve()
                .body(JsonNode.class);
            String tokenValue = response.get("token").asText();
            Instant expiresAt = Instant.parse(response.get("expires_at").asText());
            CachedToken newToken = new CachedToken(tokenValue, expiresAt);
            cachedToken.set(newToken);
            return tokenValue;
        } catch (Exception ex) {
            log.error("Failed to obtain GitHub installation token. appId={}, installationId={}, privateKeyConfigured={}, privateKeyLength={} chars",
                maskedAppId(), describeInstallationId(), isPrivateKeyConfigured(), privateKeyLength(), ex);
            throw ex;
        }
    }

    public boolean verifySignature(String payload, String secret, String signatureHeader) {
        if (signatureHeader == null || !signatureHeader.startsWith("sha256=")) {
            return false;
        }
        try {
            byte[] expected = hmacSha256(secret, payload);
            byte[] provided = hexToBytes(signatureHeader.substring(7));
            return constantTimeEquals(expected, provided);
        } catch (Exception e) {
            log.warn("Error verifying webhook signature", e);
            return false;
        }
    }

    private byte[] sign(byte[] input, String pem) throws Exception {
        Signature signature = Signature.getInstance("SHA256withRSA");
        signature.initSign(loadPrivateKey(pem));
        signature.update(input);
        return signature.sign();
    }

    private PrivateKey loadPrivateKey(String pem) throws Exception {
        boolean isPkcs1 = pem.contains("-----BEGIN RSA PRIVATE KEY");
        String sanitized = pem
            .replace("-----BEGIN PRIVATE KEY-----", "")
            .replace("-----END PRIVATE KEY-----", "")
            .replace("-----BEGIN RSA PRIVATE KEY-----", "")
            .replace("-----END RSA PRIVATE KEY-----", "")
            .replaceAll("\\s", "");
        byte[] decoded = Base64.getDecoder().decode(sanitized);
        try {
            PKCS8EncodedKeySpec spec = new PKCS8EncodedKeySpec(decoded);
            return KeyFactory.getInstance("RSA").generatePrivate(spec);
        } catch (InvalidKeySpecException ex) {
            if (!isPkcs1) {
                throw ex;
            }
            byte[] pkcs8Bytes = convertPkcs1ToPkcs8(decoded);
            PKCS8EncodedKeySpec spec = new PKCS8EncodedKeySpec(pkcs8Bytes);
            return KeyFactory.getInstance("RSA").generatePrivate(spec);
        }
    }

    private byte[] convertPkcs1ToPkcs8(byte[] pkcs1Bytes) {
        int pkcs1Length = pkcs1Bytes.length;
        int totalLength = pkcs1Length + 22;
        byte[] pkcs8Header = new byte[] {
            0x30, (byte) 0x82, (byte) (totalLength >> 8), (byte) totalLength,
            0x02, 0x01, 0x00,
            0x30, 0x0d,
            0x06, 0x09, 0x2a, (byte) 0x86, 0x48, (byte) 0x86, (byte) 0xf7, 0x0d, 0x01, 0x01, 0x01,
            0x05, 0x00,
            0x04, (byte) 0x82, (byte) (pkcs1Length >> 8), (byte) pkcs1Length
        };

        byte[] pkcs8Bytes = new byte[pkcs8Header.length + pkcs1Length];
        System.arraycopy(pkcs8Header, 0, pkcs8Bytes, 0, pkcs8Header.length);
        System.arraycopy(pkcs1Bytes, 0, pkcs8Bytes, pkcs8Header.length, pkcs1Length);
        return pkcs8Bytes;
    }

    private byte[] hmacSha256(String secret, String payload) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
    }

    private byte[] hexToBytes(String hex) {
        int len = hex.length();
        byte[] data = new byte[len / 2];
        for (int i = 0; i < len; i += 2) {
            data[i / 2] = (byte) ((Character.digit(hex.charAt(i), 16) << 4)
                + Character.digit(hex.charAt(i + 1), 16));
        }
        return data;
    }

    private boolean constantTimeEquals(byte[] a, byte[] b) {
        if (a.length != b.length) {
            return false;
        }
        int result = 0;
        for (int i = 0; i < a.length; i++) {
            result |= a[i] ^ b[i];
        }
        return result == 0;
    }

    private String requirePrivateKeyPem() {
        String pem = getPrivateKeyPem();
        if (pem == null || pem.trim().isEmpty()) {
            log.info("GitHub App private key is empty. Configure hub.github.private-key, GITHUB_PRIVATE_KEY_PEM, hub.github.private-key-file or GITHUB_PRIVATE_KEY_FILE.");
            throw new IllegalStateException("GitHub App private key is empty");
        }
        return pem;
    }

    private String getPrivateKeyPem() {
        String cached = cachedPrivateKeyPem.get();
        if (cached != null) {
            return cached;
        }

        String pem = "";

        if (isPrivateKeyFileConfigured()) {
            pem = readPrivateKeyFromFile();
        }

        if (pem.trim().isEmpty()) {
            pem = normalizePem(privateKeyPem);
            log.info("Using inline GitHub App private key");
        }

        String normalized = normalizePem(pem);
        cachedPrivateKeyPem.compareAndSet(null, normalized);
        return cachedPrivateKeyPem.get();
    }

    private String readPrivateKeyFromFile() {
        if (!isPrivateKeyFileConfigured()) {
            log.info("GitHub App private key file path is not configured.");
            return "";
        }
        PathResolution resolution = resolvePrivateKeyPath(privateKeyPath);
        try {
            Path path = resolution.path();
            log.info("Attempting to read GitHub App private key file at {} (candidates={})", path, resolution.candidates());
            String key = Files.readString(path, StandardCharsets.UTF_8);
            log.info("Successfully read GitHub App private key file at {}", path);
            return key;
        } catch (IOException e) {
            log.info("Failed to read GitHub App private key file at {}: {}", privateKeyPath, e.getMessage());
            throw new IllegalStateException("Failed to read GitHub App private key file at " + privateKeyPath
                + " (tried: " + String.join(", ", resolution.candidatesAsString()) + ")", e);
        }
    }

    private boolean isPrivateKeyFileConfigured() {
        return privateKeyPath != null && !privateKeyPath.trim().isEmpty();
    }

    private String normalizePath(String path) {
        if (path == null) {
            return "";
        }
        return path.trim().replace("\\", File.separator);
    }

    private PathResolution resolvePrivateKeyPath(String rawPath) {
        String normalized = normalizePath(rawPath);
        Path provided = Path.of(normalized);

        List<Path> candidates = new ArrayList<>();
        Path absoluteProvided = provided.isAbsolute() ? provided : provided.toAbsolutePath();
        candidates.add(absoluteProvided);

        if (!provided.isAbsolute()) {
            Path workingDirCandidate = Path.of("").toAbsolutePath().resolve(provided).normalize();
            if (!candidates.contains(workingDirCandidate)) {
                candidates.add(workingDirCandidate);
            }

            Path springConfigDir = Path.of("/app/config").resolve(provided).normalize();
            if (!candidates.contains(springConfigDir)) {
                candidates.add(springConfigDir);
            }

            Path workspaceRoot = Path.of("/workspace/ai-hub").resolve(provided).normalize();
            if (!candidates.contains(workspaceRoot)) {
                candidates.add(workspaceRoot);
            }
        }

        for (Path candidate : candidates) {
            if (Files.exists(candidate)) {
                return new PathResolution(candidate, candidates);
            }
        }

        return new PathResolution(candidates.get(0), candidates);
    }

    private String normalizePem(String pem) {
        if (pem == null) {
            return "";
        }
        String normalized = pem.trim();
        if ((normalized.startsWith("\"") && normalized.endsWith("\"")) || (normalized.startsWith("'") && normalized.endsWith("'"))) {
            normalized = normalized.substring(1, normalized.length() - 1);
        }
        if (normalized.contains("\\n")) {
            normalized = normalized.replace("\\r\\n", "\n").replace("\\n", "\n");
        }
        if (normalized.contains("\\r")) {
            normalized = normalized.replace("\\r", "\r");
        }
        return normalized;
    }

    private boolean isPrivateKeyConfigured() {
        String pem = getPrivateKeyPem();
        return pem != null && !pem.trim().isEmpty();
    }

    private int privateKeyLength() {
        return privateKeyLength(getPrivateKeyPem());
    }

    private int privateKeyLength(String pem) {
        return pem == null ? 0 : pem.length();
    }

    private String describeInstallationId() {
        return installationId > 0 ? String.valueOf(installationId) : "(missing)";
    }

    private String maskedAppId() {
        if (appId == null || appId.isBlank()) {
            return "(missing)";
        }
        String trimmed = appId.trim();
        if (trimmed.length() <= 4) {
            return "****" + trimmed;
        }
        return "****" + trimmed.substring(trimmed.length() - 4);
    }

    private record CachedToken(String token, Instant expiresAt) {
    }

    private record PathResolution(Path path, List<Path> candidates) {
        List<String> candidatesAsString() {
            return candidates.stream().map(Path::toString).toList();
        }
    }
}
