#!/usr/bin/env node

const path = require("path");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");

const envPaths = [
  path.resolve(__dirname, "..", ".env"),
  path.resolve(__dirname, "..", "..", ".env"),
  path.resolve(__dirname, "..", "..", "..", ".env"),
];
for (const envPath of envPaths) {
  dotenv.config({ path: envPath });
}

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
  console.error(
    "[RLS Verify] Missing Supabase credentials. Set SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY.",
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

function randomToken() {
  return Math.random().toString(36).slice(2, 10);
}

function createUserClient(accessToken) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

async function createTempUser(prefix) {
  const email = `${prefix}-${Date.now()}-${randomToken()}@example.com`;
  const password = `Z1!${randomToken()}${randomToken()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data?.user) {
    throw new Error(`[RLS Verify] createUser failed: ${error?.message || "unknown"}`);
  }
  return { id: data.user.id, email, password };
}

async function signIn(email, password) {
  const { data, error } = await authClient.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data?.session?.access_token) {
    throw new Error(`[RLS Verify] signIn failed for ${email}: ${error?.message || "unknown"}`);
  }
  return data.session.access_token;
}

async function expectNoRows(description, queryPromise) {
  const { data, error } = await queryPromise;
  if (error) {
    throw new Error(`[RLS Verify] ${description} failed with error: ${error.message}`);
  }
  if (Array.isArray(data) && data.length !== 0) {
    throw new Error(`[RLS Verify] ${description} expected 0 rows, got ${data.length}`);
  }
}

async function expectError(description, queryPromise) {
  const { error } = await queryPromise;
  if (!error) {
    throw new Error(`[RLS Verify] ${description} expected error, got success`);
  }
}

async function main() {
  const createdUsers = [];
  const createdBookmarkIds = [];
  const createdBundleIds = [];

  try {
    const userA = await createTempUser("phase0-a");
    const userB = await createTempUser("phase0-b");
    createdUsers.push(userA.id, userB.id);

    const tokenA = await signIn(userA.email, userA.password);
    const tokenB = await signIn(userB.email, userB.password);

    const clientA = createUserClient(tokenA);
    const clientB = createUserClient(tokenB);

    const bookmarkId = `bm_rls_${Date.now()}_${randomToken()}`;
    const bookmarkText = `phase0-rls-${randomToken()}`;
    createdBookmarkIds.push(bookmarkId);

    const { error: insertBookmarkError } = await clientA.from("bookmarks").insert({
      id: bookmarkId,
      user_id: userA.id,
      text: bookmarkText,
      created_at: new Date().toISOString(),
    });
    if (insertBookmarkError) {
      throw new Error(`[RLS Verify] userA bookmark insert failed: ${insertBookmarkError.message}`);
    }

    await expectNoRows(
      "userB cannot read userA bookmark",
      clientB.from("bookmarks").select("id").eq("id", bookmarkId),
    );

    await expectError(
      "userB cannot forge user_id on bookmark insert",
      clientB.from("bookmarks").insert({
        id: `bm_forge_${Date.now()}_${randomToken()}`,
        user_id: userA.id,
        text: `forged-${randomToken()}`,
        created_at: new Date().toISOString(),
      }),
    );

    const bundleId = `bundle_rls_${Date.now()}_${randomToken()}`;
    createdBundleIds.push(bundleId);

    const { error: insertBundleError } = await clientA
      .from("library_bundles")
      .insert({
        id: bundleId,
        user_id: userA.id,
        bundle_hash: `hash_${randomToken()}`,
        bundle: { nodes: [], edges: [] },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    if (insertBundleError) {
      throw new Error(`[RLS Verify] userA bundle insert failed: ${insertBundleError.message}`);
    }

    await expectNoRows(
      "userB cannot read userA library bundle",
      clientB.from("library_bundles").select("id").eq("id", bundleId),
    );

    await expectError(
      "userB cannot forge user_id on library bundle insert",
      clientB.from("library_bundles").insert({
        id: `bundle_forge_${Date.now()}_${randomToken()}`,
        user_id: userA.id,
        bundle_hash: `hash_forge_${randomToken()}`,
        bundle: { nodes: [], edges: [] },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    );

    console.log("[RLS Verify] PASS: Cross-user read/write isolation enforced.");
  } finally {
    for (const bookmarkId of createdBookmarkIds) {
      await admin.from("bookmarks").delete().eq("id", bookmarkId);
    }
    for (const bundleId of createdBundleIds) {
      await admin.from("library_bundles").delete().eq("id", bundleId);
    }
    for (const userId of createdUsers) {
      await admin.auth.admin.deleteUser(userId);
    }
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
