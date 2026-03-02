import { SharedAuthProbeView } from "@zero1/shared-client";
import { WEB_ENV } from "../lib/env";
import { supabase } from "../lib/supabase";

export default function SharedProbeRoute() {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <SharedAuthProbeView
        appLabel="Zero1 Web Shared Probe"
        apiBaseUrl={WEB_ENV.API_URL}
        strictEnv={WEB_ENV.STRICT_ENV}
        runtimeVersionLabel={`Web (${WEB_ENV.MODE})`}
        magicLinkRedirectTo={WEB_ENV.MAGIC_LINK_REDIRECT_TO || undefined}
        enableGoogleOAuth={WEB_ENV.ENABLE_GOOGLE_OAUTH}
        enableAppleOAuth={WEB_ENV.ENABLE_APPLE_OAUTH}
        supabase={supabase}
      />
    </div>
  );
}
