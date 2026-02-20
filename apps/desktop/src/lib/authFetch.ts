import { createAuthFetch } from "@zero1/shared-client";
import { supabase } from "./supabase";

export const authFetch = createAuthFetch(supabase);
