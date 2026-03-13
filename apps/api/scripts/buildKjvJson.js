import fs from "node:fs";
import path from "node:path";

const FILE_TO_ABBREV = {
  Gen: "gn",
  Exo: "ex",
  Lev: "lv",
  Num: "nm",
  Deu: "dt",
  Jos: "js",
  Jdg: "jud",
  Rth: "rt",
  "1Sa": "1sm",
  "2Sa": "2sm",
  "1Ki": "1kgs",
  "2Ki": "2kgs",
  "1Ch": "1ch",
  "2Ch": "2ch",
  Ezr: "ezr",
  Neh: "ne",
  Est: "et",
  Job: "job",
  Psa: "ps",
  Pro: "prv",
  Ecc: "ec",
  Sng: "so",
  Isa: "is",
  Jer: "jr",
  Lam: "lm",
  Eze: "ez",
  Dan: "dn",
  Hos: "ho",
  Joe: "jl",
  Amo: "am",
  Oba: "ob",
  Jon: "jn",
  Mic: "mi",
  Nah: "na",
  Hab: "hk",
  Zep: "zp",
  Hag: "hg",
  Zec: "zc",
  Mal: "ml",
  Mat: "mt",
  Mar: "mk",
  Luk: "lk",
  Jhn: "jo",
  Act: "act",
  Rom: "rm",
  "1Co": "1co",
  "2Co": "2co",
  Gal: "gl",
  Eph: "eph",
  Phl: "ph",
  Col: "cl",
  "1Th": "1ts",
  "2Th": "2ts",
  "1Ti": "1tm",
  "2Ti": "2tm",
  Tit: "tt",
  Phm: "phm",
  Heb: "hb",
  Jas: "jm",
  "1Pe": "1pe",
  "2Pe": "2pe",
  "1Jo": "1jo",
  "2Jo": "2jo",
  "3Jo": "3jo",
  Jde: "jd",
  Rev: "re",
};

const BOOK_NAMES = {
  gn: "Genesis",
  ex: "Exodus",
  lv: "Leviticus",
  nm: "Numbers",
  dt: "Deuteronomy",
  js: "Joshua",
  jud: "Judges",
  rt: "Ruth",
  "1sm": "1 Samuel",
  "2sm": "2 Samuel",
  "1kgs": "1 Kings",
  "2kgs": "2 Kings",
  "1ch": "1 Chronicles",
  "2ch": "2 Chronicles",
  ezr: "Ezra",
  ne: "Nehemiah",
  et: "Esther",
  job: "Job",
  ps: "Psalms",
  prv: "Proverbs",
  ec: "Ecclesiastes",
  so: "Song of Solomon",
  is: "Isaiah",
  jr: "Jeremiah",
  lm: "Lamentations",
  ez: "Ezekiel",
  dn: "Daniel",
  ho: "Hosea",
  jl: "Joel",
  am: "Amos",
  ob: "Obadiah",
  jn: "Jonah",
  mi: "Micah",
  na: "Nahum",
  hk: "Habakkuk",
  zp: "Zephaniah",
  hg: "Haggai",
  zc: "Zechariah",
  ml: "Malachi",
  mt: "Matthew",
  mk: "Mark",
  lk: "Luke",
  jo: "John",
  act: "Acts",
  rm: "Romans",
  "1co": "1 Corinthians",
  "2co": "2 Corinthians",
  gl: "Galatians",
  eph: "Ephesians",
  ph: "Philippians",
  cl: "Colossians",
  "1ts": "1 Thessalonians",
  "2ts": "2 Thessalonians",
  "1tm": "1 Timothy",
  "2tm": "2 Timothy",
  tt: "Titus",
  phm: "Philemon",
  hb: "Hebrews",
  jm: "James",
  "1pe": "1 Peter",
  "2pe": "2 Peter",
  "1jo": "1 John",
  "2jo": "2 John",
  "3jo": "3 John",
  jd: "Jude",
  re: "Revelation",
};

const BOOK_ORDER = [
  "gn",
  "ex",
  "lv",
  "nm",
  "dt",
  "js",
  "jud",
  "rt",
  "1sm",
  "2sm",
  "1kgs",
  "2kgs",
  "1ch",
  "2ch",
  "ezr",
  "ne",
  "et",
  "job",
  "ps",
  "prv",
  "ec",
  "so",
  "is",
  "jr",
  "lm",
  "ez",
  "dn",
  "ho",
  "jl",
  "am",
  "ob",
  "jn",
  "mi",
  "na",
  "hk",
  "zp",
  "hg",
  "zc",
  "ml",
  "mt",
  "mk",
  "lk",
  "jo",
  "act",
  "rm",
  "1co",
  "2co",
  "gl",
  "eph",
  "ph",
  "cl",
  "1ts",
  "2ts",
  "1tm",
  "2tm",
  "tt",
  "phm",
  "hb",
  "jm",
  "1pe",
  "2pe",
  "1jo",
  "2jo",
  "3jo",
  "jd",
  "re",
];

const stripStrongs = (text) =>
  text.replace(/\[([HG]\d+)\]/g, "").replace(/<\/?em>/g, "");

const findStrongsDir = () => {
  const candidates = [
    path.resolve(process.cwd(), "public", "bible", "strongs"),
    path.resolve(process.cwd(), "..", "public", "bible", "strongs"),
    path.resolve(process.cwd(), "..", "..", "public", "bible", "strongs"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
};

const resolveOutPath = () => {
  const candidates = [
    path.resolve(process.cwd(), "apps", "api", "data"),
    path.resolve(process.cwd(), "data"),
    path.resolve(process.cwd(), "..", "apps", "api", "data"),
    path.resolve(process.cwd(), "..", "..", "apps", "api", "data"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return path.join(candidate, "kjv.json");
  }
  return null;
};

const strongsDir = findStrongsDir();
if (!strongsDir) {
  console.error("Could not find public/bible/strongs directory.");
  process.exit(1);
}

const outPath = resolveOutPath();
if (!outPath) {
  console.error("Could not find apps/api/data directory for output.");
  process.exit(1);
}

const files = fs.readdirSync(strongsDir).filter((f) => f.endsWith(".json"));
const bookMap = new Map();

for (const file of files) {
  const fileKey = path.basename(file, ".json");
  const bookAbbrev = FILE_TO_ABBREV[fileKey];
  if (!bookAbbrev) continue;

  const raw = fs.readFileSync(path.join(strongsDir, file), "utf-8");
  const chapters = [];

  const verseRegex =
    /"([1-3]?[A-Za-z]+)\\|(\\d+)\\|(\\d+)":\\s*\\{\\s*"en":\\s*"((?:\\\\.|[^"\\\\])*)"/g;
  verseRegex.lastIndex = 0;
  let match;
  while ((match = verseRegex.exec(raw)) !== null) {
    const chapterNum = Number(match[2]);
    const verseNum = Number(match[3]);
    if (!Number.isFinite(chapterNum) || !Number.isFinite(verseNum)) continue;
    if (!chapters[chapterNum - 1]) chapters[chapterNum - 1] = [];

    const encoded = match[4];
    let text = encoded;
    try {
      text = JSON.parse(`"${encoded}"`);
    } catch {
      text = encoded;
    }
    chapters[chapterNum - 1][verseNum - 1] = stripStrongs(text);
  }

  bookMap.set(bookAbbrev, chapters);
}

const books = BOOK_ORDER.map((abbrev) => ({
  abbrev,
  name: BOOK_NAMES[abbrev] || abbrev.toUpperCase(),
  chapters: bookMap.get(abbrev) || [],
}));

const outDir = path.dirname(outPath);
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

fs.writeFileSync(outPath, JSON.stringify(books, null, 2));

console.log(`Wrote KJV JSON to ${outPath}`);
