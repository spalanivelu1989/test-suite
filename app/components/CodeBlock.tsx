"use client";

import { Box, Flex } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { useThemeMode } from "@/app/providers";
import { getAWSColors } from "@/app/theme/aws";

// A read-only code/text viewer: monospace, a line-number gutter, preserved
// indentation and NO wrapping (long lines scroll horizontally instead of folding),
// plus lightweight TS/JS syntax highlighting (hand-rolled, like highlightSQL in
// SqlQuery.tsx — no parser dependency). Used by the SQL Query cell viewer to show
// spec test code and JSON cleanly.

const FONT = "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace";
const LINE_HEIGHT = "20px";

// TS/JS reserved words + common Playwright/test terms worth emphasizing.
const KEYWORDS = [
  "const",
  "let",
  "var",
  "function",
  "return",
  "if",
  "else",
  "for",
  "while",
  "do",
  "switch",
  "case",
  "break",
  "continue",
  "new",
  "await",
  "async",
  "import",
  "export",
  "from",
  "default",
  "class",
  "extends",
  "super",
  "this",
  "typeof",
  "instanceof",
  "in",
  "of",
  "try",
  "catch",
  "finally",
  "throw",
  "yield",
  "void",
  "delete",
  "null",
  "undefined",
  "true",
  "false",
  "as",
  "interface",
  "type",
  "enum",
  "public",
  "private",
  "protected",
  "readonly",
  "static",
  "implements",
  "namespace",
  "declare",
  "get",
  "set",
];

interface CodeColors {
  comment: string;
  string: string;
  number: string;
  keyword: string;
  func: string;
  type: string;
  punct: string;
  text: string;
}

const CODE_REGEX = new RegExp(
  [
    "(//[^\\n]*)", // 1 line comment
    "(/\\*[\\s\\S]*?\\*/)", // 2 block comment
    "(`(?:\\\\[\\s\\S]|[^`\\\\])*`)", // 3 template literal
    "('(?:\\\\.|[^'\\\\])*')", // 4 single-quoted string
    '("(?:\\\\.|[^"\\\\])*")', // 5 double-quoted string
    "(\\b\\d[\\d_]*(?:\\.[\\d_]+)?\\b)", // 6 number
    `(\\b(?:${KEYWORDS.join("|")})\\b)`, // 7 keyword
    "([A-Za-z_$][\\w$]*)(?=\\s*\\()", // 8 function/method call
    "([A-Za-z_$][\\w$]*)", // 9 identifier
    "(\\s+)", // 10 whitespace
    "([^\\s])", // 11 any other single char (punctuation/operators)
  ].join("|"),
  "g",
);

/** Tokenize TS/JS/JSON into colored spans. Unmatched text falls through plainly. */
function highlightCode(code: string, colors: CodeColors): ReactNode[] {
  const parts: ReactNode[] = [];
  let match: RegExpExecArray | null;
  let key = 0;
  CODE_REGEX.lastIndex = 0;

  while ((match = CODE_REGEX.exec(code)) !== null) {
    if (match.index === CODE_REGEX.lastIndex) CODE_REGEX.lastIndex++;
    const [
      ,
      lineComment,
      blockComment,
      template,
      single,
      double,
      number,
      keyword,
      func,
      ident,
      whitespace,
      other,
    ] = match;

    if (lineComment || blockComment) {
      parts.push(
        <span
          key={key++}
          style={{ color: colors.comment, fontStyle: "italic" }}
        >
          {lineComment || blockComment}
        </span>,
      );
    } else if (template || single || double) {
      parts.push(
        <span key={key++} style={{ color: colors.string }}>
          {template || single || double}
        </span>,
      );
    } else if (number) {
      parts.push(
        <span key={key++} style={{ color: colors.number }}>
          {number}
        </span>,
      );
    } else if (keyword) {
      parts.push(
        <span key={key++} style={{ color: colors.keyword, fontWeight: 600 }}>
          {keyword}
        </span>,
      );
    } else if (func) {
      parts.push(
        <span key={key++} style={{ color: colors.func }}>
          {func}
        </span>,
      );
    } else if (ident) {
      // Capitalized identifiers read as types/classes/components.
      const isType = /^[A-Z]/.test(ident);
      parts.push(
        <span key={key++} style={isType ? { color: colors.type } : undefined}>
          {ident}
        </span>,
      );
    } else if (whitespace) {
      parts.push(whitespace);
    } else if (other) {
      parts.push(
        <span key={key++} style={{ color: colors.punct }}>
          {other}
        </span>,
      );
    }
  }
  return parts;
}

export function CodeBlock({ content }: { content: string }) {
  const { theme } = useThemeMode();
  const aws = getAWSColors(theme);
  const isDark = theme === "dark";

  // Drop a single trailing newline so we don't render a blank final line.
  const code = content.replace(/\n$/, "");
  const lineTotal = code.split("\n").length;
  const bg = isDark ? "#1e1e2e" : aws.subBg;
  const gutterBg = isDark ? "#181825" : "#f1f5f9";

  const colors: CodeColors = isDark
    ? {
        comment: "#838ba7",
        string: "#a6d189",
        number: "#ef9f76",
        keyword: "#ca9ee6",
        func: "#8caaee",
        type: "#e5c890",
        punct: "#99a0c0",
        text: aws.text,
      }
    : {
        comment: "#94a3b8",
        string: "#16a34a",
        number: "#ea580c",
        keyword: "#8839ef",
        func: "#1e66f5",
        type: "#df8e1d",
        punct: "#64748b",
        text: aws.text,
      };

  return (
    <Box
      border={`1px solid ${aws.border}`}
      borderRadius="8px"
      overflow="hidden"
      bg={bg}
    >
      <Flex align="stretch">
        {/* Line-number gutter (fixed; only the code column scrolls sideways) */}
        <Box
          flexShrink={0}
          bg={gutterBg}
          color={aws.subtext}
          fontFamily={FONT}
          fontSize="12.5px"
          lineHeight={LINE_HEIGHT}
          textAlign="right"
          py="12px"
          pl="10px"
          pr="10px"
          userSelect="none"
          borderRight={`1px solid ${aws.border}`}
        >
          {Array.from({ length: lineTotal }, (_, i) => (
            <Box key={i} height={LINE_HEIGHT}>
              {i + 1}
            </Box>
          ))}
        </Box>

        {/* Code — horizontal scroll keeps indentation and line structure intact */}
        <Box flex="1" overflowX="auto" py="12px">
          <Box
            as="pre"
            m={0}
            px="14px"
            fontFamily={FONT}
            fontSize="12.5px"
            lineHeight={LINE_HEIGHT}
            color={colors.text}
            style={{ whiteSpace: "pre" }}
          >
            {highlightCode(code, colors)}
          </Box>
        </Box>
      </Flex>
    </Box>
  );
}
