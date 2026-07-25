import { describe, expect, it } from "vitest";
import { applySearchSuggestion, getSearchAutocomplete } from "../src/renderer/search-autocomplete";

const context = {
  accounts: [
    {
      id: "gmail-one",
      email: "dev@fluxmail.test",
      displayName: "Work",
      provider: "gmail" as const,
      status: "active" as const,
    },
  ],
  labels: ["Receipts", "Project Alpha"],
};

describe("search autocomplete", () => {
  it("suggests filters for the token at the cursor", () => {
    const result = getSearchAutocomplete("hello su", 8, context);

    expect(result.suggestions.map((suggestion) => suggestion.label)).toEqual(["subject:"]);
    expect(applySearchSuggestion("hello su", result, result.suggestions[0]!)).toEqual({
      value: "hello subject:",
      cursor: 14,
    });
  });

  it("keeps attachment negation", () => {
    const result = getSearchAutocomplete("hello -ha", 9, context);
    const attachment = result.suggestions.find((suggestion) => suggestion.label === "has:");

    expect(attachment).toBeDefined();
    expect(applySearchSuggestion("hello -ha", result, attachment!)).toEqual({
      value: "hello -has:",
      cursor: 11,
    });
  });

  it("offers values for status and attachment filters", () => {
    expect(
      getSearchAutocomplete("is:u", 4, context).suggestions.map((suggestion) => suggestion.label),
    ).toEqual(["is:unread", "is:unstarred"]);
    expect(getSearchAutocomplete("has:", 4, context).suggestions[0]?.label).toBe("has:attachment");
  });

  it("only advertises operators supported by portable search", () => {
    for (const operator of [
      "account",
      "label",
      "cc",
      "bcc",
      "filename",
      "filetype",
      "newer",
      "older",
    ])
      expect(getSearchAutocomplete(operator, operator.length, context).suggestions).toEqual([]);
    expect(getSearchAutocomplete("after:", 6, context).suggestions).toEqual([]);
    expect(
      getSearchAutocomplete("in:", 3, context).suggestions.map(({ label }) => label),
    ).not.toContain("in:starred");
  });
});
