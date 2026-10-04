import { useState } from "react";

/** Reset a local draft before rendering a changed filter or dialog scope. */
export function useResettableState(initialValue, dependencies) {
  const [previous, setPrevious] = useState(dependencies);
  const [value, setValue] = useState(initialValue);
  const changed = dependencies.length !== previous.length || dependencies.some((item, index) => !Object.is(item, previous[index]));
  if (changed) {
    const resetValue = typeof initialValue === "function" ? initialValue() : initialValue;
    setPrevious(dependencies);
    setValue(resetValue);
    return [resetValue, setValue];
  }
  return [value, setValue];
}
