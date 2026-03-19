package com.aihub.hub.service;

import com.aihub.hub.service.UnifiedDiffApplier.AppliedDiff;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class UnifiedDiffApplierTest {

    private final UnifiedDiffApplier diffApplier = new UnifiedDiffApplier();

    @Test
    void applyUsesContextToPlaceHunkWhenLineNumbersAreShifted() {
        String originalContent = String.join("\n",
                "intro",
                "new header",
                "target",
                "after");

        String diff = String.join("\n",
                "diff --git a/file.txt b/file.txt",
                "--- a/file.txt",
                "+++ b/file.txt",
                "@@ -2,2 +2,3 @@",
                " target",
                "+inserted",
                " after");

        Map<String, AppliedDiff> parsed = diffApplier.parse(diff);
        AppliedDiff fileDiff = parsed.get("file.txt");

        String updated = diffApplier.apply(originalContent, fileDiff);

        String expected = String.join("\n",
                "intro",
                "new header",
                "target",
                "inserted",
                "after") + "\n";

        assertThat(updated).isEqualTo(expected);
    }
}
