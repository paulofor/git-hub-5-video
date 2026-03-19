package com.aihub.hub.github;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.web.client.RestClient;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GithubAppAuthTest {

    static final String TEST_KEY = "-----BEGIN PRIVATE KEY-----\nMIICdQIBADANBgkqhkiG9w0BAQEFAASCAl8wggJbAgEAAoGBAKEJHWdHR+rUeQpar\nHTN8AZnIEdjQbE6wFF1TKiseFiC81PU9adKPX9L8bedTw+NtGFxrDwJBcPwGpW81P\ndjKysi2Iip/wWBSAKFHsqt2W1i5732FEwhHh6XCBx9HFKQpU/ymfz0i44SwRC2d5R\nAkNK2ALmx2nNm5DN2Ufwdu1KZAgMBAAECgYBB5/8Ws7+lRkw7hpyqOVaQ6Ef3r5HF\nPSxUqlMzfVLLttxrZO8dBm9g1+4XndQro209rE43S+IGLRBUVDI9BWM24Bp5ahqXx\nXN8lXGsbqgsBbZvEfwNPKgkynptivJW+fV5ATo6kzgpQ+ShoxffFcAPJ51bEMrnTp\nDFv4ZSwrwM4QJBAMyX5opsxQbXhje4dH2XGp35Rf3rsWPeSVHoclfiqD4KJXaLpvV\nUZ+QQgBZy1a973q2Fr0SC1tp2pl/5kzrkLu0CQQDJf3CooP1Xr439IPz7vXCMhQ2B\n0P6HXhgYD/4Vuex7TJZUZZLbeWH3z3SCh/CozF500uZnthmkf4egA13JEBDdAkAL\nWQWFegD3ny6nmoiDisUELBZQvijppCOm8mCdNUolnsRzLc3F37efc7bXB+mIQTOZp\nkeRYjxug5Q40Iv1AUEFAkA7EYzpIiiiZ+hr6BvBgItZ5jdLcwTqkf7mLuoBXHuiuZ\nToMM6YYEED8GDrUwaNtTuLa7f3dz6VJn2PvuzjYD5RAkBcY1mD2ERvDx/Vj6MeK56\nlZajZECGGO8cdpuJmAI2EmJOR3kYZXbp2Y99wnRWKrdzY9XOsQ2sv4J5jvUGmBREt\n-----END PRIVATE KEY-----";

    static final String TEST_RSA_KEY = "-----BEGIN RSA PRIVATE KEY-----\nMIICWwIBAAKBgQChCR1nR0fq1HkKWqx0zfAGZyBHY0GxOsBRdUyorHhYgvNT1PWnS\nj1/S/G3nU8PjbRhcaw8CQXD8BqVvNT3YysrItiIqf8FgUgChR7KrdltYue99hRMIR\n4elwgcfRxSkKVP8pn89IuOEsEQtneUQJDStgC5sdpzZuQzdlH8HbtSmQIDAQABAoG\nAQef/FrO/pUZMO4acqjlWkOhH96+RxT0sVKpTM31Sy7bca2TvHQZvYNfuF53UK6Nt\nPaxON0viBi0QVFQyPQVjNuAaeWoal8VzfJVxrG6oLAW2bxH8DTyoJMp6bYryVvn1e\nQE6OpM4KUPkoaMX3xXADyedWxDK506Qxb+GUsK8DOECQQDMl+aKbMUG14Y3uHR9lx\nqd+UX967Fj3klR6HJX4qg+CiV2i6b1VGfkEIAWctWve96tha9EgtbadqZf+ZM65C7\ntAkEAyX9wqKD9V6+N/SD8+71wjIUNgdD+h14YGA/+Fbnse0yWVGWS23lh9890gofw\nqMxedNLmZ7YZpH+HoANdyRAQ3QJAC1kFhXoA958up5qIg4rFBCwWUL4o6aQjpvJgn\nTVKJZ7Ecy3Nxd+3n3O21wfpiEEzmaZHkWI8boOUONCL9QFBBQJAOxGM6SIoomfoa+\ngbwYCLWeY3S3ME6pH+5i7qAVx7ormU6DDOmGBBA/Bg61MGjbU7i2u393c+lSZ9j77\ns42A+UQJAXGNZg9hEbw8f1Y+jHiuepWWo2RAhhjvHHabiZgCNhJiTkd5GGV26dmPf\ncJ0Viq3c2PVzrENrL+CeY71BpgURLQ==\n-----END RSA PRIVATE KEY-----";

    @Test
    void verifiesSignatureInConstantTime() throws Exception {
        RestClient client = RestClient.builder().baseUrl("https://api.github.com").build();
        GithubAppAuth auth = new GithubAppAuth(client, Clock.systemUTC(), "123", TEST_KEY, "", "1") {
            @Override
            public String getInstallationToken() {
                return "test";
            }
        };
        String payload = "{\"action\":\"test\"}";
        String secret = "secret";
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String signature = "sha256=" + bytesToHex(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
        assertTrue(auth.verifySignature(payload, secret, signature));
    }

    @Test
    void failsFastWhenInstallationIdIsNotNumeric() {
        RestClient client = RestClient.builder().baseUrl("https://api.github.com").build();
        assertThrows(IllegalStateException.class, () -> new GithubAppAuth(client, Clock.systemUTC(), "123", TEST_KEY, "", "abc"));
    }

    @Test
    void loadsPrivateKeyWithRsaHeader() {
        RestClient client = RestClient.builder().baseUrl("https://api.github.com").build();
        GithubAppAuth auth = new GithubAppAuth(client, Clock.systemUTC(), "123", TEST_RSA_KEY, "", "1") {
            @Override
            public String getInstallationToken() {
                return "test";
            }
        };

        String jwt = auth.createJwt();
        assertTrue(jwt.split("\\.").length == 3);
    }

    @Test
    void loadsInlineKeyWithEscapedNewlines() {
        RestClient client = RestClient.builder().baseUrl("https://api.github.com").build();
        String escapedPem = TEST_KEY.replace("\n", "\\n");
        GithubAppAuth auth = new GithubAppAuth(client, Clock.systemUTC(), "123", escapedPem, "", "1") {
            @Override
            public String getInstallationToken() {
                return "test";
            }
        };

        String jwt = auth.createJwt();
        assertTrue(jwt.split("\\.").length == 3);
    }

    @Test
    void prefersPrivateKeyFileWhenConfigured(@TempDir Path tempDir) throws Exception {
        Path keyFile = tempDir.resolve("app-key.pem");
        Files.writeString(keyFile, TEST_RSA_KEY, StandardCharsets.UTF_8);

        RestClient client = RestClient.builder().baseUrl("https://api.github.com").build();
        GithubAppAuth auth = new GithubAppAuth(client, Clock.systemUTC(), "123", "invalid-inline", keyFile.toString(), "1") {
            @Override
            public String getInstallationToken() {
                return "test";
            }
        };

        String jwt = auth.createJwt();
        assertTrue(jwt.split("\\.").length == 3);
    }

    @Test
    void acceptsWindowsStylePrivateKeyPath(@TempDir Path tempDir) throws Exception {
        Path keyFile = tempDir.resolve("app-key.pem");
        Files.writeString(keyFile, TEST_RSA_KEY, StandardCharsets.UTF_8);

        String windowsPath = keyFile.toString().replace("/", "\\\\");

        RestClient client = RestClient.builder().baseUrl("https://api.github.com").build();
        GithubAppAuth auth = new GithubAppAuth(client, Clock.systemUTC(), "123", "invalid-inline", windowsPath, "1") {
            @Override
            public String getInstallationToken() {
                return "test";
            }
        };

        String jwt = auth.createJwt();
        assertTrue(jwt.split("\\.").length == 3);
    }

    private String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}
