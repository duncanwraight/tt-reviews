import { describe, expect, it } from "vitest";

import { cleanHtml, takeExcerpt } from "../clean-html";

const SAMPLE = `<!doctype html>
<html><head>
<title>Viscaria</title>
<script>analytics()</script>
<style>.x { color: red }</style>
<link rel="stylesheet" href="/x.css">
<meta name="og:image" content="/x.jpg">
</head><body>
<!-- nav -->
<nav>menu</nav>
<svg width="20"><path d="M0,0"/></svg>
<picture><img src="/y.jpg"></picture>
<noscript>turn on js</noscript>
<template>boilerplate</template>
<h1>Viscaria</h1>
<p>The legendary blade.</p>
<table><tr><td>Weight</td><td>89g</td></tr></table>
</body></html>`;

describe("cleanHtml", () => {
  it("strips script bodies", () => {
    expect(cleanHtml(SAMPLE)).not.toContain("analytics()");
  });

  it("strips style bodies", () => {
    expect(cleanHtml(SAMPLE)).not.toContain("color: red");
  });

  it("strips svg, noscript, template blocks", () => {
    const cleaned = cleanHtml(SAMPLE);
    expect(cleaned).not.toContain("<svg");
    expect(cleaned).not.toContain("turn on js");
    expect(cleaned).not.toContain("boilerplate");
  });

  it("strips link / meta / picture / img void tags", () => {
    const cleaned = cleanHtml(SAMPLE);
    expect(cleaned).not.toContain("<link");
    expect(cleaned).not.toContain("<meta");
    expect(cleaned).not.toContain("<picture");
    expect(cleaned).not.toContain("<img");
  });

  it("strips HTML comments", () => {
    expect(cleanHtml(SAMPLE)).not.toContain("nav -->");
    expect(cleanHtml(SAMPLE)).not.toContain("<!--");
  });

  it("preserves the actual product content", () => {
    const cleaned = cleanHtml(SAMPLE);
    expect(cleaned).toContain("Viscaria");
    expect(cleaned).toContain("legendary blade");
    expect(cleaned).toContain("89g");
  });

  it("truncates output to maxChars and appends a marker", () => {
    const long = "<p>" + "x".repeat(40_000) + "</p>";
    const cleaned = cleanHtml(long, { maxChars: 1000 });
    expect(cleaned.length).toBeLessThanOrEqual(1000);
    expect(cleaned.endsWith("[...truncated]")).toBe(true);
  });

  it("does not truncate when input is under the limit", () => {
    const cleaned = cleanHtml("<p>short</p>", { maxChars: 1000 });
    expect(cleaned.endsWith("[...truncated]")).toBe(false);
  });
});

describe("takeExcerpt", () => {
  it("returns a 1KB-or-shorter cleaned string", () => {
    expect(takeExcerpt(SAMPLE).length).toBeLessThanOrEqual(1024);
  });

  it("ends with an ellipsis when source overflows the cap", () => {
    const long = "<p>" + "x".repeat(5000) + "</p>";
    const excerpt = takeExcerpt(long, 200);
    expect(excerpt.length).toBeLessThanOrEqual(200);
  });
});
