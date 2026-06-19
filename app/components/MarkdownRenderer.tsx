"use client";

import { Box } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { useThemeMode } from "@/app/providers";
import { getAWSColors } from "@/app/theme/aws";
import { catppuccinAlpha, getCatppuccinColors } from "@/app/theme/catppuccin";

// A small, dependency-free Markdown renderer. The codebase ships no markdown
// library and hand-rolls its highlighters (see highlightSQL in SqlQuery.tsx), so
// this keeps that ethos. It covers what the knowledge-layer plans actually use:
// headings, paragraphs, ordered/unordered lists, code fences, inline code,
// bold/italic/strikethrough, links, blockquotes and horizontal rules. It is NOT a
// CommonMark-complete parser — anything it doesn't recognize falls through as text.

interface ColorSet {
  text: string;
  subtext: string;
  border: string;
  codeBg: string;
  accent: string;
  link: string;
}

/** Parse inline spans (code, bold, italic, strikethrough, links) into nodes. */
function parseInline(
  text: string,
  colors: ColorSet,
  keyBase: string,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Order matters: code first (its contents are literal), then the rest.
  const regex =
    /(`[^`]+`)|(\*\*[^*]+\*\*|__[^_]+__)|(~~[^~]+~~)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-i${i++}`;
    if (tok.startsWith("`")) {
      nodes.push(
        <code
          key={key}
          style={{
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
            fontSize: "0.88em",
            background: colors.codeBg,
            border: `1px solid ${colors.border}`,
            borderRadius: "4px",
            padding: "1px 5px",
          }}
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith("**") || tok.startsWith("__")) {
      nodes.push(
        <strong key={key} style={{ fontWeight: 700, color: colors.text }}>
          {parseInline(tok.slice(2, -2), colors, key)}
        </strong>,
      );
    } else if (tok.startsWith("~~")) {
      nodes.push(
        <s key={key} style={{ opacity: 0.7 }}>
          {tok.slice(2, -2)}
        </s>,
      );
    } else if (tok.startsWith("[")) {
      const close = tok.indexOf("](");
      const label = tok.slice(1, close);
      const href = tok.slice(close + 2, -1);
      nodes.push(
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: colors.link, textDecoration: "underline" }}
        >
          {label}
        </a>,
      );
    } else {
      nodes.push(
        <em key={key} style={{ fontStyle: "italic" }}>
          {tok.slice(1, -1)}
        </em>,
      );
    }
    last = regex.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const HEADING_SIZES = ["1.5em", "1.3em", "1.15em", "1.02em", "0.95em", "0.9em"];

/** Split a "| a | b |" table row into trimmed cell strings. */
function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((cell) => cell.trim());
}

/** True if a line is a GFM table separator row, e.g. "| --- | :--: |". */
function isSeparatorRow(line: string): boolean {
  if (!line.includes("-")) return false;
  const cells = splitTableRow(line);
  return (
    cells.length > 0 &&
    cells.every((cell) => /^:?-{1,}:?$/.test(cell.replace(/\s/g, "")))
  );
}

type Align = "left" | "center" | "right";

function cellAlign(sep: string): Align {
  const s = sep.trim();
  const left = s.startsWith(":");
  const right = s.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  return "left";
}

/** Render Markdown source as React nodes. */
function renderBlocks(src: string, colors: ColorSet): ReactNode[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Fenced code block ```lang … ```
    if (/^```/.test(trimmed)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        body.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push(
        <Box
          key={key++}
          as="pre"
          my={2.5}
          p={3}
          bg={colors.codeBg}
          border={`1px solid ${colors.border}`}
          borderRadius="8px"
          overflowX="auto"
          fontFamily="mono"
          fontSize="12.5px"
          lineHeight="1.55"
          color={colors.text}
        >
          {body.join("\n")}
        </Box>,
      );
      continue;
    }

    // Blank line
    if (trimmed === "") {
      i++;
      continue;
    }

    // Horizontal rule
    if (/^([-*_])\1{2,}$/.test(trimmed.replace(/\s+/g, ""))) {
      blocks.push(
        <Box
          key={key++}
          as="hr"
          my={4}
          border="none"
          borderTop={`1px solid ${colors.border}`}
        />,
      );
      i++;
      continue;
    }

    // Heading
    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (h) {
      const level = h[1].length;
      blocks.push(
        <Box
          key={key++}
          as={`h${level}` as "h1"}
          mt={key === 1 ? 0 : 4}
          mb={2}
          fontWeight={700}
          fontSize={HEADING_SIZES[level - 1]}
          color={colors.text}
          lineHeight="1.3"
        >
          {parseInline(h[2], colors, `h${key}`)}
        </Box>,
      );
      i++;
      continue;
    }

    // Blockquote (group consecutive > lines)
    if (/^>\s?/.test(trimmed)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quote.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(
        <Box
          key={key++}
          as="blockquote"
          my={2.5}
          pl={3}
          borderLeft={`3px solid ${colors.accent}`}
          color={colors.subtext}
          fontStyle="italic"
        >
          {parseInline(quote.join(" "), colors, `bq${key}`)}
        </Box>,
      );
      continue;
    }

    // List (ordered or unordered) — group consecutive item lines.
    // GFM table — a header row followed by a separator row, then body rows.
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      isSeparatorRow(lines[i + 1])
    ) {
      const headers = splitTableRow(line);
      const aligns = splitTableRow(lines[i + 1]).map(cellAlign);
      i += 2;
      const bodyRows: string[][] = [];
      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        lines[i].includes("|")
      ) {
        bodyRows.push(splitTableRow(lines[i]));
        i++;
      }
      const tKey = key++;
      blocks.push(
        <Box
          key={tKey}
          my={3}
          overflowX="auto"
          border={`1px solid ${colors.border}`}
          borderRadius="8px"
        >
          <Box
            as="table"
            width="100%"
            style={{ borderCollapse: "collapse", fontSize: "12.5px" }}
          >
            <Box as="thead">
              <Box as="tr">
                {headers.map((h, hi) => (
                  <Box
                    as="th"
                    key={hi}
                    px={3}
                    py={2}
                    textAlign={aligns[hi] ?? "left"}
                    bg={colors.codeBg}
                    color={colors.text}
                    fontWeight={700}
                    borderBottom={`1px solid ${colors.border}`}
                    borderRight={
                      hi < headers.length - 1
                        ? `1px solid ${colors.border}`
                        : undefined
                    }
                  >
                    {parseInline(h, colors, `th${tKey}-${hi}`)}
                  </Box>
                ))}
              </Box>
            </Box>
            <Box as="tbody">
              {bodyRows.map((r, ri) => (
                <Box as="tr" key={ri}>
                  {headers.map((_, ci) => (
                    <Box
                      as="td"
                      key={ci}
                      px={3}
                      py={2}
                      textAlign={aligns[ci] ?? "left"}
                      verticalAlign="top"
                      color={colors.text}
                      borderBottom={
                        ri < bodyRows.length - 1
                          ? `1px solid ${colors.border}`
                          : undefined
                      }
                      borderRight={
                        ci < headers.length - 1
                          ? `1px solid ${colors.border}`
                          : undefined
                      }
                    >
                      {parseInline(
                        r[ci] ?? "",
                        colors,
                        `td${tKey}-${ri}-${ci}`,
                      )}
                    </Box>
                  ))}
                </Box>
              ))}
            </Box>
          </Box>
        </Box>,
      );
      continue;
    }

    const listItem = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
    if (listItem.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: { indent: number; content: string }[] = [];
      while (i < lines.length && listItem.test(lines[i])) {
        const mm = listItem.exec(lines[i])!;
        items.push({ indent: mm[1].length, content: mm[3] });
        i++;
      }
      blocks.push(
        <Box
          key={key++}
          as={ordered ? "ol" : "ul"}
          my={2}
          pl={5}
          color={colors.text}
          style={{
            listStyleType: ordered ? "decimal" : "disc",
            display: "block",
          }}
        >
          {items.map((it, idx) => (
            <Box
              as="li"
              key={idx}
              mb={1}
              ml={it.indent >= 2 ? `${Math.min(it.indent / 2, 4) * 12}px` : 0}
              lineHeight="1.6"
            >
              {parseInline(it.content, colors, `li${key}-${idx}`)}
            </Box>
          ))}
        </Box>,
      );
      continue;
    }

    // Paragraph — gather consecutive plain lines until a blank/structural line.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^```/.test(lines[i].trim()) &&
      !/^(#{1,6})\s+/.test(lines[i].trim()) &&
      !/^>\s?/.test(lines[i].trim()) &&
      !listItem.test(lines[i]) &&
      !(
        lines[i].includes("|") &&
        i + 1 < lines.length &&
        isSeparatorRow(lines[i + 1])
      )
    ) {
      para.push(lines[i].trim());
      i++;
    }
    blocks.push(
      <Box
        key={key++}
        as="p"
        my={2}
        color={colors.text}
        lineHeight="1.65"
        fontSize="13.5px"
      >
        {parseInline(para.join(" "), colors, `p${key}`)}
      </Box>,
    );
  }

  return blocks;
}

export function MarkdownRenderer({ content }: { content: string }) {
  const { theme } = useThemeMode();
  const aws = getAWSColors(theme);
  const c = getCatppuccinColors(theme);
  const isDark = theme === "dark";

  const colors: ColorSet = {
    text: aws.text,
    subtext: aws.subtext,
    border: aws.border,
    codeBg: isDark ? catppuccinAlpha(c.surface0, 0.5) : aws.subBg,
    accent: c.sapphire,
    link: c.blue,
  };

  return (
    <Box fontSize="13.5px" color={colors.text}>
      {renderBlocks(content, colors)}
    </Box>
  );
}
