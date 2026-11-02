// The Albanian dictionaries are typed against the English ones: same keys,
// string values. A missing or extra key fails the type check.
export type Translation<T> = T extends string
  ? string
  : { [K in keyof T]: Translation<T[K]> };
