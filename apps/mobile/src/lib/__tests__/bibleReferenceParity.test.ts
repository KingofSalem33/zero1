import { resolveBibleBookName } from "@zero1/shared";
import { resolveBookName } from "../../../../web/src/utils/bibleReference";

describe("cross-client bible book resolution parity", () => {
  const cases: Array<{ input: string; expected: string | null }> = [
    { input: "John", expected: "John" },
    { input: "rev", expected: "Revelation" },
    { input: "song of songs", expected: "Song of Solomon" },
    { input: "ii tim", expected: "2 Timothy" },
    { input: "jud", expected: null },
    { input: "jo", expected: null },
    { input: "unknown-book", expected: null },
  ];

  it.each(cases)(
    "resolves '%s' consistently across shared and web",
    ({ input, expected }) => {
      expect(resolveBibleBookName(input)).toBe(expected);
      expect(resolveBookName(input)).toBe(expected);
    },
  );
});
