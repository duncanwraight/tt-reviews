// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock React Router — UnifiedSubmissionForm imports Form + useNavigate.
// We only need a plain <form>; the post action is a no-op in these tests.
vi.mock("react-router", () => ({
  Form: ({
    children,
    onSubmit,
    ...props
  }: {
    children: React.ReactNode;
    onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  }) => (
    <form onSubmit={onSubmit} {...props}>
      {children}
    </form>
  ),
  useNavigate: () => vi.fn(),
}));

// RouterFormModalWrapper normally wraps submission state modals; in tests
// we unwrap it immediately by calling the children render-prop with
// isLoading: false.
vi.mock("~/components/ui/RouterFormModalWrapper", () => ({
  RouterFormModalWrapper: ({
    children,
  }: {
    children: (state: { isLoading: boolean }) => React.ReactNode;
  }) => <>{children({ isLoading: false })}</>,
}));

vi.mock("~/components/ui/CSRFToken", () => ({
  CSRFToken: () => null,
}));

// FormField dispatches to specific input types. Stub it with a simple
// labeled input so validation / extraction assertions are straightforward.
vi.mock("../fields/FormField", () => ({
  FormField: ({
    field,
    value,
    onChange,
    error,
  }: {
    field: { name: string; label: string; type: string };
    value: unknown;
    onChange: (name: string, value: unknown) => void;
    error?: string;
  }) => (
    <div>
      <label htmlFor={field.name}>{field.label}</label>
      <input
        id={field.name}
        name={field.name}
        value={(value as string) ?? ""}
        onChange={e => onChange(field.name, e.target.value)}
      />
      {error && <p data-testid={`error-${field.name}`}>{error}</p>}
    </div>
  ),
}));

import { UnifiedSubmissionForm } from "../UnifiedSubmissionForm";

const makeConfig = (
  fields: Array<{
    name: string;
    label: string;
    type: string;
    required?: boolean;
    validation?: { min?: number; max?: number; message?: string };
  }>
) => ({
  displayName: "Review",
  form: {
    title: "Submit Review",
    description: "",
    submitButtonText: "Submit",
    redirectPath: "/",
    successTitle: "Thanks",
    successMessage: "Saved.",
    fields,
  },
});

describe("UnifiedSubmissionForm", () => {
  it("shows a 'required' error when submitting with a required field empty", () => {
    const config = makeConfig([
      { name: "title", label: "Title", type: "text", required: true },
    ]);

    render(<UnifiedSubmissionForm config={config as any} csrfToken="t" />);

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(screen.getByTestId("error-title")).toHaveTextContent(
      "Title is required"
    );
  });

  // Regression test for todo/BUGS.md: "form shows 'Equipment Details is
  // required' even when fields filled". Submitting with a required field
  // populated must NOT produce a false-positive validation error.
  it("does not show a 'required' error when the field is filled", () => {
    const config = makeConfig([
      { name: "title", label: "Title", type: "text", required: true },
    ]);

    render(<UnifiedSubmissionForm config={config as any} csrfToken="t" />);

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "My review" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(screen.queryByTestId("error-title")).not.toBeInTheDocument();
  });

  it("clears a previously-shown error when the user types into that field", () => {
    const config = makeConfig([
      { name: "title", label: "Title", type: "text", required: true },
    ]);

    render(<UnifiedSubmissionForm config={config as any} csrfToken="t" />);

    // Trigger the error first.
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(screen.getByTestId("error-title")).toBeInTheDocument();

    // Typing should clear it without needing another submit.
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "x" },
    });
    expect(screen.queryByTestId("error-title")).not.toBeInTheDocument();
  });

  it("flags a field that is under min-length validation", () => {
    const config = makeConfig([
      {
        name: "title",
        label: "Title",
        type: "text",
        required: true,
        validation: { min: 5, message: "Too short" },
      },
    ]);

    render(<UnifiedSubmissionForm config={config as any} csrfToken="t" />);

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "abc" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(screen.getByTestId("error-title")).toHaveTextContent("Too short");
  });

  it("reports errors for multiple required fields at once", () => {
    const config = makeConfig([
      { name: "title", label: "Title", type: "text", required: true },
      { name: "body", label: "Body", type: "textarea", required: true },
    ]);

    render(<UnifiedSubmissionForm config={config as any} csrfToken="t" />);

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(screen.getByTestId("error-title")).toHaveTextContent(
      "Title is required"
    );
    expect(screen.getByTestId("error-body")).toHaveTextContent(
      "Body is required"
    );
  });

  it("skips required validation for non-required fields when empty", () => {
    const config = makeConfig([
      { name: "title", label: "Title", type: "text", required: true },
      { name: "notes", label: "Notes", type: "textarea", required: false },
    ]);

    render(<UnifiedSubmissionForm config={config as any} csrfToken="t" />);

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "ok" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(screen.queryByTestId("error-notes")).not.toBeInTheDocument();
  });
});
