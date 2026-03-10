import { supabase } from "../db";

const EXPECTED_KJV_VERSE_COUNT = 31102;

export interface BibleDataIntegrityStatus {
  healthy: boolean;
  totalVerses: number;
  expectedVerses: number;
  missingTextRows: number;
}

export async function checkBibleDataIntegrity(): Promise<BibleDataIntegrityStatus> {
  const { count: totalVerses, error: totalError } = await supabase
    .from("verses")
    .select("id", { count: "exact", head: true });

  if (totalError) {
    throw new Error(
      `[BIBLE INTEGRITY] Failed total verse count check: ${totalError.message}`,
    );
  }

  const { count: missingEmpty, error: missingEmptyError } = await supabase
    .from("verses")
    .select("id", { count: "exact", head: true })
    .eq("text", "");

  if (missingEmptyError) {
    throw new Error(
      `[BIBLE INTEGRITY] Failed missing text check: ${missingEmptyError.message}`,
    );
  }

  const { count: missingNull, error: missingNullError } = await supabase
    .from("verses")
    .select("id", { count: "exact", head: true })
    .is("text", null);

  if (missingNullError) {
    throw new Error(
      `[BIBLE INTEGRITY] Failed null text check: ${missingNullError.message}`,
    );
  }

  const status: BibleDataIntegrityStatus = {
    healthy:
      (totalVerses ?? 0) === EXPECTED_KJV_VERSE_COUNT &&
      (missingEmpty ?? 0) + (missingNull ?? 0) === 0,
    totalVerses: totalVerses ?? 0,
    expectedVerses: EXPECTED_KJV_VERSE_COUNT,
    missingTextRows: (missingEmpty ?? 0) + (missingNull ?? 0),
  };

  if (status.healthy) {
    console.log(
      `[BIBLE INTEGRITY] OK total=${status.totalVerses} missingText=${status.missingTextRows}`,
    );
  } else {
    console.error(
      `[BIBLE INTEGRITY] FAIL total=${status.totalVerses}/${status.expectedVerses} missingText=${status.missingTextRows}`,
    );
  }

  return status;
}
