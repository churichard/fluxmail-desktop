import { useId, useMemo, useState, type RefObject } from "react";
import { LoaderCircle, Search } from "lucide-react";
import type { AccountInfo } from "../../shared/contracts";
import {
  applySearchSuggestion,
  getSearchAutocomplete,
  type SearchSuggestion,
} from "../search-autocomplete";

interface Props {
  value: string;
  deferredValue: string;
  inputRef: RefObject<HTMLInputElement | null>;
  accounts: AccountInfo[];
  labels: string[];
  onChange(value: string): void;
  onSubmit(): void;
}

export function MailSearchBox(props: Props) {
  const listboxId = useId();
  const [cursor, setCursor] = useState(props.value.length);
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const autocomplete = useMemo(
    () =>
      getSearchAutocomplete(props.value, cursor, {
        accounts: props.accounts,
        labels: props.labels,
      }),
    [cursor, props.accounts, props.labels, props.value],
  );
  const visible = open && autocomplete.suggestions.length > 0;
  const activeIndex =
    selectedIndex === null ? null : Math.min(selectedIndex, autocomplete.suggestions.length - 1);
  const hasActiveFragment = (value: string, nextCursor: number) =>
    Boolean(
      getSearchAutocomplete(value, nextCursor, {
        accounts: props.accounts,
        labels: props.labels,
      }).fragment,
    );

  const selectSuggestion = (suggestion: SearchSuggestion) => {
    const next = applySearchSuggestion(props.value, autocomplete, suggestion);
    props.onChange(next.value);
    setCursor(next.cursor);
    setSelectedIndex(null);
    setOpen(true);
    window.requestAnimationFrame(() => {
      props.inputRef.current?.focus();
      props.inputRef.current?.setSelectionRange(next.cursor, next.cursor);
    });
  };

  return (
    <form
      className="search-box"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit();
      }}
    >
      <Search size={16} />
      <input
        ref={props.inputRef}
        role="combobox"
        value={props.value}
        onChange={(event) => {
          const nextCursor = event.target.selectionStart ?? event.target.value.length;
          props.onChange(event.target.value);
          setCursor(nextCursor);
          setSelectedIndex(hasActiveFragment(event.target.value, nextCursor) ? 0 : null);
          setOpen(true);
        }}
        onClick={(event) => {
          setCursor(event.currentTarget.selectionStart ?? props.value.length);
          setSelectedIndex(null);
          setOpen(true);
        }}
        onFocus={(event) => {
          const nextCursor = event.currentTarget.selectionStart ?? props.value.length;
          setCursor(nextCursor);
          setSelectedIndex(hasActiveFragment(props.value, nextCursor) ? 0 : null);
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && visible) {
            event.preventDefault();
            setOpen(false);
            return;
          }
          if (event.key === "ArrowDown" && visible) {
            event.preventDefault();
            setSelectedIndex((current) =>
              current === null ? 0 : (current + 1) % autocomplete.suggestions.length,
            );
            return;
          }
          if (event.key === "ArrowUp" && visible) {
            event.preventDefault();
            setSelectedIndex((current) =>
              current === null
                ? autocomplete.suggestions.length - 1
                : (current - 1 + autocomplete.suggestions.length) % autocomplete.suggestions.length,
            );
            return;
          }
          if ((event.key === "Enter" || event.key === "Tab") && visible && activeIndex !== null) {
            event.preventDefault();
            selectSuggestion(autocomplete.suggestions[activeIndex]!);
          }
        }}
        placeholder="Search mail"
        aria-label="Search mail"
        aria-autocomplete="list"
        aria-expanded={visible}
        aria-controls={visible ? listboxId : undefined}
        aria-activedescendant={
          visible && activeIndex !== null ? `${listboxId}-${activeIndex}` : undefined
        }
      />
      {props.value !== props.deferredValue ? (
        <LoaderCircle className="spin" size={14} />
      ) : (
        <kbd>⌘K</kbd>
      )}
      {visible ? (
        <div id={listboxId} className="search-autocomplete" role="listbox" aria-label="Filters">
          {autocomplete.suggestions.map((suggestion, index) => (
            <button
              id={`${listboxId}-${index}`}
              key={suggestion.id}
              type="button"
              role="option"
              className={index === activeIndex ? "active" : ""}
              aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={() => selectSuggestion(suggestion)}
            >
              <code>{suggestion.label}</code>
              <span>{suggestion.description}</span>
            </button>
          ))}
        </div>
      ) : null}
    </form>
  );
}
