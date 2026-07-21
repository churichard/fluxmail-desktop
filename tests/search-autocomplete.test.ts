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

  it("suggests and quotes known label values", () => {
    const result = getSearchAutocomplete("from:amy label:proj", 19, context);

    expect(result.suggestions.map((suggestion) => suggestion.label)).toEqual([
      'label:"Project Alpha"',
    ]);
    expect(applySearchSuggestion("from:amy label:proj", result, result.suggestions[0]!)).toEqual({
      value: 'from:amy label:"Project Alpha" ',
      cursor: 31,
    });
  });

  it("suggests account values by display name", () => {
    const result = getSearchAutocomplete("account:work", 12, context);

    expect(result.suggestions[0]).toMatchObject({
      label: "account:dev@fluxmail.test",
      description: "Work",
    });
  });

  it("keeps negation and surrounding boolean syntax", () => {
    const result = getSearchAutocomplete("is:unread OR (-ha)", 17, context);
    const attachment = result.suggestions.find((suggestion) => suggestion.label === "has:");

    expect(attachment).toBeDefined();
    expect(applySearchSuggestion("is:unread OR (-ha)", result, attachment!)).toEqual({
      value: "is:unread OR (-has:)",
      cursor: 19,
    });
  });

  it("offers values for status and attachment filters", () => {
    expect(
      getSearchAutocomplete("is:u", 4, context).suggestions.map((suggestion) => suggestion.label),
    ).toEqual(["is:unread"]);
    expect(getSearchAutocomplete("has:", 4, context).suggestions[0]?.label).toBe("has:attachment");
  });
});
