// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

describe("testing-library + happy-dom plumbing", () => {
  it("renders JSX and matches with jest-dom matchers", () => {
    render(<button>Hello</button>);
    expect(screen.getByRole("button", { name: "Hello" })).toBeInTheDocument();
  });
});
