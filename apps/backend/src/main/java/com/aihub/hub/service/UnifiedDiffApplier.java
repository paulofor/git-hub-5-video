package com.aihub.hub.service;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
public class UnifiedDiffApplier {

    public Map<String, AppliedDiff> parse(String diffText) {
        Map<String, AppliedDiff> result = new HashMap<>();
        String[] lines = diffText.split("\n");
        AppliedDiff current = null;
        Hunk currentHunk = null;
        for (String rawLine : lines) {
            String line = rawLine;
            if (line.startsWith("diff --git")) {
                current = new AppliedDiff();
                current.hunks = new ArrayList<>();
                result.put("pending", current);
            } else if (line.startsWith("--- ")) {
                if (current != null) {
                    current.oldPath = line.substring(4).trim();
                }
            } else if (line.startsWith("+++ ")) {
                if (current != null) {
                    current.newPath = line.substring(4).trim();
                    if (current.newPath.startsWith("b/")) {
                        current.newPath = current.newPath.substring(2);
                    }
                    if (current.oldPath != null && current.oldPath.startsWith("a/")) {
                        current.oldPath = current.oldPath.substring(2);
                    }
                    result.put(current.newPath, current);
                }
            } else if (line.startsWith("@@")) {
                if (current != null) {
                    currentHunk = new Hunk();
                    currentHunk.lines = new ArrayList<>();
                    String[] parts = line.split(" ");
                    if (parts.length >= 3) {
                        currentHunk.originalStart = parseStart(parts[1]);
                        currentHunk.newStart = parseStart(parts[2]);
                    }
                    current.hunks.add(currentHunk);
                }
            } else {
                if (currentHunk != null) {
                    currentHunk.lines.add(line);
                }
            }
        }
        result.remove("pending");
        return result;
    }

    private int parseStart(String chunk) {
        String[] split = chunk.substring(1).split(",");
        return Integer.parseInt(split[0]);
    }

    public String apply(String originalContent, AppliedDiff diff) {
        List<String> originalLines;
        if (originalContent == null) {
            originalLines = new ArrayList<>();
        } else {
            originalLines = new ArrayList<>(Arrays.asList(originalContent.split("\n", -1)));
            if (originalContent.endsWith("\n")) {
                originalLines.add("");
            }
        }
        List<String> result = new ArrayList<>();
        int originalIndex = 0;
        for (Hunk hunk : diff.hunks) {
            int target = computeHunkStart(originalLines, hunk, originalIndex);
            while (originalIndex < target && originalIndex < originalLines.size()) {
                result.add(originalLines.get(originalIndex++));
            }
            for (String line : hunk.lines) {
                if (line.isEmpty()) {
                    continue;
                }
                char symbol = line.charAt(0);
                String value = line.length() > 1 ? line.substring(1) : "";
                switch (symbol) {
                    case ' ' -> {
                        if (originalIndex < originalLines.size()) {
                            result.add(originalLines.get(originalIndex++));
                        } else {
                            result.add(value);
                        }
                    }
                    case '-' -> {
                        if (originalIndex < originalLines.size()) {
                            originalIndex++;
                        }
                    }
                    case '+' -> result.add(value);
                    default -> {
                    }
                }
            }
        }
        while (originalIndex < originalLines.size()) {
            result.add(originalLines.get(originalIndex++));
        }
        return String.join("\n", result).replaceAll("\n$", "") + "\n";
    }

    private int computeHunkStart(List<String> originalLines, Hunk hunk, int processedIndex) {
        int expectedIndex = Math.max(hunk.originalStart - 1, 0);
        List<String> contextLines = extractContextLines(hunk);
        if (contextLines.isEmpty() || originalLines.isEmpty()) {
            return Math.max(expectedIndex, processedIndex);
        }

        int matchIndex = findContextPosition(originalLines, contextLines, expectedIndex);
        return Math.max(matchIndex, processedIndex);
    }

    private List<String> extractContextLines(Hunk hunk) {
        List<String> context = new ArrayList<>();
        for (String line : hunk.lines) {
            if (line.isEmpty()) {
                continue;
            }
            char symbol = line.charAt(0);
            if (symbol == ' ' || symbol == '-') {
                context.add(line.substring(1));
            }
        }
        return context;
    }

    private int findContextPosition(List<String> originalLines, List<String> contextLines, int expectedIndex) {
        int contextSize = contextLines.size();
        if (contextSize == 0) {
            return expectedIndex;
        }

        int lastPossibleStart = originalLines.size() - contextSize;
        for (int start = 0; start <= lastPossibleStart; start++) {
            boolean matches = true;
            for (int i = 0; i < contextSize; i++) {
                if (!originalLines.get(start + i).equals(contextLines.get(i))) {
                    matches = false;
                    break;
                }
            }
            if (matches) {
                return start;
            }
        }

        String anchor = contextLines.get(0);
        int bestIndex = expectedIndex;
        int smallestDistance = Integer.MAX_VALUE;
        for (int i = 0; i < originalLines.size(); i++) {
            if (originalLines.get(i).equals(anchor)) {
                int distance = Math.abs(i - expectedIndex);
                if (distance < smallestDistance) {
                    smallestDistance = distance;
                    bestIndex = i;
                }
            }
        }

        return bestIndex;
    }

    public static class AppliedDiff {
        private String oldPath;
        private String newPath;
        private List<Hunk> hunks;

        public String getOldPath() {
            return oldPath;
        }

        public String getNewPath() {
            return newPath;
        }

        public List<Hunk> getHunks() {
            return hunks;
        }
    }

    private static class Hunk {
        private int originalStart;
        private int newStart;
        private List<String> lines;
    }
}
