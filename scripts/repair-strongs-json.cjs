#!/usr/bin/env node
/**
 * Repair malformed Strong's JSON data files.
 *
 * The files have a known, rigid structure:
 * {"Book":{"Book|ch":{"Book|ch|v":{"en":"...","bg":"...","ch":"...","sp":"..."}}}}
 *
 * Corruption types:
 * 1. \\" (double-backslash + quote) — double-escaping errors
 * 2. Bare unescaped " inside string values (Bulgarian quotation marks)
 * 3. Phm.json: two books concatenated
 *
 * Strategy: find all STRUCTURAL quote positions (key delimiters, value
 * boundaries) using the rigid data pattern, then escape everything else.
 */
const fs = require("fs");
const path = require("path");

const STRONGS_DIR = path.join(__dirname, "..", "public", "bible", "strongs");
const ESCAPED_QUOTE = "\\" + '"'; // literal \"

/**
 * Given the raw file content, find all positions of structural quotes.
 * Structural quotes are: key openers/closers and value openers/closers.
 *
 * The data structure means structural quotes appear in patterns like:
 *   {"key":"value","key":"value",...}
 *
 * Between any two structural quotes that bound a string VALUE, all internal
 * quotes should be escaped.
 */
function repairFile(raw) {
  // First, normalize all \\" to " (remove the double-backslash prefix entirely).
  // We'll re-add proper escaping in the next pass.
  // This handles both corruption types: \\" at boundaries (becomes ")
  // and \\" inside values (becomes " which we'll escape later).
  let data = raw;
  while (data.indexOf("\\\\" + '"') !== -1) {
    data = data.split("\\\\" + '"').join('"');
  }

  // Now try parsing — might already be valid (if \\" was the only issue)
  try {
    JSON.parse(data);
    return data;
  } catch (_) {
    // Still has bare quotes — proceed to structure-aware repair
  }

  // Parse character-by-character, using JSON structure rules to identify
  // which quotes are structural and which are internal to values.
  //
  // Track state machine: outside-string vs. inside-string.
  // When we encounter a " inside a string, determine if it's the real
  // end by checking if what follows forms valid JSON structure.
  //
  // Key insight: after a value-closing ", the next meaningful char must be
  // one of: , } ] (and we can verify the next key/value starts correctly)

  const result = [];
  let i = 0;
  let inString = false;

  while (i < data.length) {
    const cc = data.charCodeAt(i);

    if (!inString) {
      result.push(data[i]);
      if (cc === 34) inString = true; // "
      i++;
      continue;
    }

    // Inside a string
    if (cc === 92) {
      // Backslash — copy escape sequence
      // In clean data after step 1, remaining backslashes should be
      // legitimate escapes like \n, \t, etc.
      result.push(data[i]);
      if (i + 1 < data.length) {
        result.push(data[i + 1]);
        i += 2;
      } else {
        i++;
      }
      continue;
    }

    if (cc !== 34) {
      // Not a quote — regular character, just copy
      result.push(data[i]);
      i++;
      continue;
    }

    // We have a " (quote) inside a string. Is this the real end of the string?
    // Look ahead to verify JSON structure continues correctly after closing.
    if (isRealStringEnd(data, i)) {
      result.push('"');
      inString = false;
      i++;
    } else {
      // Internal quote — escape it
      result.push(ESCAPED_QUOTE);
      i++;
    }
  }

  return result.join("");
}

/**
 * Check if the quote at position `pos` in `data` is a real string-ending quote.
 *
 * After a real string-closing quote, valid JSON must have one of:
 * - , (next element in object/array)
 * - } (end of object)
 * - ] (end of array)
 * - : (this string was a key, now the value follows)
 *
 * For ambiguous "" sequences (two quotes in a row), check further context.
 */
function isRealStringEnd(data, pos) {
  let j = pos + 1;
  while (j < data.length && " \t\n\r".includes(data[j])) j++;

  if (j >= data.length) return true; // end of file

  const next = data.charCodeAt(j);

  // Clear structural followers
  if (next === 58 || next === 125 || next === 93) return true; // : } ]

  if (next === 44) {
    // Comma — verify it leads to a real JSON key.
    // In this data format, after a structural comma there's always "key":
    // where key is a language code (en/bg/ch/sp) or verse/chapter ID.
    let k = j + 1;
    while (k < data.length && " \t\n\r".includes(data[k])) k++;
    if (data.charCodeAt(k) === 34) {
      // Quote after comma — find the key content
      let keyStart = k + 1;
      let keyEnd = keyStart;
      while (keyEnd < data.length && data.charCodeAt(keyEnd) !== 34) keyEnd++;
      const keyContent = data.substring(keyStart, keyEnd);
      // Check for colon after closing quote
      let m = keyEnd + 1;
      while (m < data.length && " \t\n\r".includes(data[m])) m++;
      if (data.charCodeAt(m) === 58) {
        // "key": pattern — verify key looks like a real data key
        // Language codes: en, bg, ch, sp (2 chars)
        // Verse IDs: like "Act|4|9", "1Co|1|19" (contain |)
        // Book/chapter: like "Act", "Act|4"
        if (
          keyContent.length <= 4 ||
          keyContent.includes("|") ||
          /^[0-9]?[A-Z][a-z]{1,2}$/.test(keyContent)
        ) {
          return true; // real structural comma + key
        }
      }
    }
    // Comma followed by non-key content — it's text, not structure
    return false;
  }

  if (next === 34) {
    // Another quote follows: ""
    // Check if THIS quote ends the string and the NEXT quote starts a new one,
    // or if this is an internal quote followed by more internal content.
    //
    // If the second quote is followed by a key pattern like xx": or Book|ch|v":
    // then this is: end-of-value " + start-of-key "
    let k = j + 1;
    // Check for short key pattern (2-3 chars + " + :)
    // "en": "bg": "ch": "sp": or verse ID
    while (k < data.length && data.charCodeAt(k) !== 34 && k - j < 50) k++;
    if (k < data.length && data.charCodeAt(k) === 34) {
      // Found closing quote of potential key
      const keyContent = data.substring(j + 1, k);
      let m = k + 1;
      while (m < data.length && " \t\n\r".includes(data[m])) m++;
      if (data.charCodeAt(m) === 58) {
        // Pattern: "keyContent":  — this is a real key
        return true;
      }
    }

    // Otherwise: check if the second " is followed by structural chars
    // j points to the second quote, so j+1 is right after it
    let k3 = j + 1;
    while (k3 < data.length && " \t\n\r".includes(data[k3])) k3++;
    const afterSecondQuote = data.charCodeAt(k3);
    if (
      afterSecondQuote === 44 ||
      afterSecondQuote === 125 ||
      afterSecondQuote === 93
    ) {
      // text"", or text""} — first " is internal, second ends string
      return false;
    }

    // Default: treat as end of string
    return true;
  }

  // Quote followed by something else (letter, number, etc.)
  // This is an internal quote — NOT end of string
  return false;
}

// ======================== Main ========================

// Step 0: Fix Phm.json concatenation
const phmPath = path.join(STRONGS_DIR, "Phm.json");
const phmRaw = fs.readFileSync(phmPath, "utf-8");
const splitIdx = phmRaw.indexOf("}}}}{");
if (splitIdx !== -1) {
  // 4 closing braces for: book > chapter > verse > langs
  fs.writeFileSync(phmPath, phmRaw.substring(0, splitIdx + 4), "utf-8");
  console.log("Phm.json: split off concatenated Philippians data");
}

// Process all files
const files = fs.readdirSync(STRONGS_DIR).filter((f) => f.endsWith(".json"));
let fixedCount = 0;

for (const file of files) {
  const filePath = path.join(STRONGS_DIR, file);
  const raw = fs.readFileSync(filePath, "utf-8");

  try {
    JSON.parse(raw);
    continue;
  } catch (_) {
    // needs repair
  }

  const repaired = repairFile(raw);

  try {
    JSON.parse(repaired);
    fs.writeFileSync(filePath, repaired, "utf-8");
    fixedCount++;
    console.log(file + ": repaired");
  } catch (e) {
    const posMatch = e.message.match(/position (\d+)/);
    const pos = posMatch ? parseInt(posMatch[1]) : 0;
    console.error(file + ": FAILED — " + e.message.substring(0, 80));
    console.error(
      "  context: " +
        JSON.stringify(repaired.substring(Math.max(0, pos - 60), pos + 60)),
    );
  }
}

// Final validation
let allValid = true;
for (const file of files) {
  try {
    JSON.parse(fs.readFileSync(path.join(STRONGS_DIR, file), "utf-8"));
  } catch (_) {
    console.error("STILL BROKEN: " + file);
    allValid = false;
  }
}

console.log(
  allValid
    ? "\nAll " + files.length + " files valid. " + fixedCount + " repaired."
    : "\nSome files still have errors.",
);
