export const ALL_FILTER_VALUE = "all" as const;

export type AllFilterValue = typeof ALL_FILTER_VALUE;
export type FilterValue<TValue extends string> = TValue | AllFilterValue;

export function appendFilterParam<TValue extends string>(params: URLSearchParams, name: string, value: FilterValue<TValue>): void {
  if (value !== ALL_FILTER_VALUE) {
    params.set(name, value);
  }
}

export function isFilterValue<TValue extends string>(value: unknown, values: readonly TValue[]): value is FilterValue<TValue> {
  return value === ALL_FILTER_VALUE || (typeof value === "string" && values.includes(value as TValue));
}

export function stripAllFilterValues(params: URLSearchParams, names: string[]): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const name of names) {
    if (next.get(name) === ALL_FILTER_VALUE) {
      next.delete(name);
    }
  }
  return next;
}
