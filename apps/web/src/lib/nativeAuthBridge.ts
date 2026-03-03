import type { SupabaseClient } from "@supabase/supabase-js";

const NATIVE_BRIDGE_SOURCE = "zero1-mobile";
const NATIVE_BRIDGE_TYPE = "native-auth-session";
const WEB_BRIDGE_SOURCE = "zero1-web";
const WEB_BRIDGE_READY_TYPE = "native-auth-bridge-ready";

interface NativeAuthSessionPayload {
  accessToken: string;
  refreshToken: string;
}

interface NativeAuthBridgeMessage {
  source: typeof NATIVE_BRIDGE_SOURCE;
  type: typeof NATIVE_BRIDGE_TYPE;
  payload: NativeAuthSessionPayload | null;
}

interface WebBridgeReadyMessage {
  source: typeof WEB_BRIDGE_SOURCE;
  type: typeof WEB_BRIDGE_READY_TYPE;
  emittedAtIso: string;
}

function parseBridgeMessage(data: unknown): NativeAuthBridgeMessage | null {
  const parsed =
    typeof data === "string"
      ? (() => {
          try {
            return JSON.parse(data);
          } catch {
            return null;
          }
        })()
      : data;

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const maybeMessage = parsed as Partial<NativeAuthBridgeMessage>;
  if (
    maybeMessage.source !== NATIVE_BRIDGE_SOURCE ||
    maybeMessage.type !== NATIVE_BRIDGE_TYPE
  ) {
    return null;
  }

  if (maybeMessage.payload === null) {
    return {
      source: NATIVE_BRIDGE_SOURCE,
      type: NATIVE_BRIDGE_TYPE,
      payload: null,
    };
  }

  if (
    !maybeMessage.payload ||
    typeof maybeMessage.payload !== "object" ||
    typeof (maybeMessage.payload as NativeAuthSessionPayload).accessToken !==
      "string" ||
    typeof (maybeMessage.payload as NativeAuthSessionPayload).refreshToken !==
      "string"
  ) {
    return null;
  }

  return {
    source: NATIVE_BRIDGE_SOURCE,
    type: NATIVE_BRIDGE_TYPE,
    payload: {
      accessToken: (maybeMessage.payload as NativeAuthSessionPayload)
        .accessToken,
      refreshToken: (maybeMessage.payload as NativeAuthSessionPayload)
        .refreshToken,
    },
  };
}

function sessionFingerprint(payload: NativeAuthSessionPayload | null): string {
  if (!payload) return "signed-out";
  return `${payload.accessToken}:${payload.refreshToken}`;
}

export function installNativeAuthBridge(supabase: SupabaseClient): () => void {
  const runtimeWindow = globalThis as Window & {
    ReactNativeWebView?: { postMessage: (message: string) => void };
  };

  if (!runtimeWindow.addEventListener || !runtimeWindow.removeEventListener) {
    return () => {};
  }

  const emitBridgeReady = () => {
    const bridge = runtimeWindow.ReactNativeWebView;
    if (!bridge || typeof bridge.postMessage !== "function") {
      return;
    }

    const message: WebBridgeReadyMessage = {
      source: WEB_BRIDGE_SOURCE,
      type: WEB_BRIDGE_READY_TYPE,
      emittedAtIso: new Date().toISOString(),
    };

    try {
      bridge.postMessage(JSON.stringify(message));
    } catch {
      // Ignore non-fatal bridge messaging errors.
    }
  };

  let lastAppliedFingerprint: string | null = null;

  const applyMessage = async (message: NativeAuthBridgeMessage) => {
    const nextFingerprint = sessionFingerprint(message.payload);
    if (nextFingerprint === lastAppliedFingerprint) {
      return;
    }

    if (!message.payload) {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) {
        console.warn("[NativeAuthBridge] Failed to apply native sign-out", {
          message: error.message,
        });
        return;
      }

      lastAppliedFingerprint = nextFingerprint;
      return;
    }

    const { error } = await supabase.auth.setSession({
      access_token: message.payload.accessToken,
      refresh_token: message.payload.refreshToken,
    });

    if (error) {
      console.warn("[NativeAuthBridge] Failed to apply native session", {
        message: error.message,
      });
      return;
    }

    lastAppliedFingerprint = nextFingerprint;
  };

  const handleMessage = (event: MessageEvent) => {
    const message = parseBridgeMessage(event.data);
    if (!message) {
      return;
    }

    void applyMessage(message);
  };

  runtimeWindow.addEventListener("message", handleMessage);
  emitBridgeReady();

  return () => {
    runtimeWindow.removeEventListener("message", handleMessage);
  };
}
