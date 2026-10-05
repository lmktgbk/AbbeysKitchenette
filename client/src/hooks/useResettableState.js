import { useState } from "react";

/**
 * Keeps local state within a dialog/filter scope and resets it when dependencies change.
 * Dependency identity follows Object.is; callers should pass stable scope values.
 * A function initialValue acts as a lazy initializer, including on subsequent resets.
 */
export function useResettableState(initialValue, dependencies) {
  const [previous, setPrevious] = useState(dependencies);
  const [value, setValue] = useState(initialValue);
  const changed = dependencies.length !== previous.length || dependencies.some((item, index) => !Object.is(item, previous[index]));
  // Adjust this hook’s own state during render so consumers never render the previous scope’s draft.
  if (changed) {
    const resetValue = typeof initialValue === "function" ? initialValue() : initialValue;
    setPrevious(dependencies);
    setValue(resetValue);
    return [resetValue, setValue];
  }
  return [value, setValue];
}
