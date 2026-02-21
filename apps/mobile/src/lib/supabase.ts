import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { MOBILE_ENV } from "./env";

if (!MOBILE_ENV.SUPABASE_URL || !MOBILE_ENV.SUPABASE_ANON_KEY) {
  console.warn(
    "[Mobile Supabase] Missing credentials. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.",
  );
}

export const supabase = createClient(
  MOBILE_ENV.SUPABASE_URL,
  MOBILE_ENV.SUPABASE_ANON_KEY,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);
