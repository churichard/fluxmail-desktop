/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { createRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MailSearchBox } from "../src/renderer/components/MailSearchBox";

afterEach(cleanup);

describe("mail search box", () => {
  it("opens filter suggestions and inserts one with the keyboard", () => {
    const onChange = vi.fn();
    const rendered = render(
      <MailSearchBox
        value=""
        deferredValue=""
        inputRef={createRef<HTMLInputElement>()}
        accounts={[]}
        labels={[]}
        onChange={onChange}
        onSubmit={vi.fn()}
      />,
    );
    const input = screen.getByRole("combobox", { name: "Search mail" });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "su", selectionStart: 2 } });
    rendered.rerender(
      <MailSearchBox
        value="su"
        deferredValue="su"
        inputRef={createRef<HTMLInputElement>()}
        accounts={[]}
        labels={[]}
        onChange={onChange}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole("listbox", { name: "Filters" })).toBeVisible();
    expect(screen.getByRole("option", { name: /subject:/ })).toBeVisible();
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenLastCalledWith("subject:");
  });

  it("submits instead of inserting when no suggestion is selected", () => {
    const onSubmit = vi.fn();
    render(
      <MailSearchBox
        value=""
        deferredValue=""
        inputRef={createRef<HTMLInputElement>()}
        accounts={[]}
        labels={[]}
        onChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    const input = screen.getByRole("combobox", { name: "Search mail" });

    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.submit(input.closest("form")!);

    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("inserts a clicked value suggestion", () => {
    const onChange = vi.fn();
    render(
      <MailSearchBox
        value="is:"
        deferredValue="is:"
        inputRef={createRef<HTMLInputElement>()}
        accounts={[]}
        labels={[]}
        onChange={onChange}
        onSubmit={vi.fn()}
      />,
    );
    const input = screen.getByRole("combobox", { name: "Search mail" });

    fireEvent.focus(input);
    fireEvent.click(screen.getByRole("option", { name: /is:unread/ }));

    expect(onChange).toHaveBeenCalledWith("is:unread ");
  });
});
