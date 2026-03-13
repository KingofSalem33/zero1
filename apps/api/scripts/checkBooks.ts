import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
);

async function main() {
  const allBooks = new Map<string, string>();
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("verses")
      .select("book_abbrev, book_name")
      .range(offset, offset + pageSize - 1);

    if (error || !data || data.length === 0) break;

    data.forEach((v) => allBooks.set(v.book_abbrev, v.book_name));
    offset += pageSize;

    if (data.length < pageSize) break;
  }

  const sorted = Array.from(allBooks.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  console.log(JSON.stringify(sorted, null, 2));
  console.log("\nTotal unique books:", sorted.length);
}

main();
