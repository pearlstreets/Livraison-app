/**
 * OTP v2 API client for Livraison_pearl (Expo driver app).
 *
 * Talks to the Pearl Streets Django backend. Sends `user_type: "delivery_driver"`
 * on verify so the backend looks up `ProfessionalUser` WITH a linked
 * `DeliveryDriverProfile` (account_active=True). Suspended/banned drivers
 * get `user_found=false` — they cannot log in via phone OTP.
 *
 * Falls back to legacy email/password (services/authService.js) when
 * backend flag OTP_V2_ENABLED=false — zero regression.
 */

// Same API host as services/api.js. Kept in sync manually — if api.js
// changes host, update this too.
const API_BASE = "https://pythonapi.digiexports.in";

function apiBase() {
  return `${API_BASE.replace(/\/+$/, "")}/api/v1`;
}

export async function requestOtp({
  phone,
  channel = "sms",
  defaultRegion,
  platform = "app-delivery",
}) {
  try {
    const response = await fetch(`${apiBase()}/auth/v2/request-otp/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone,
        channel,
        default_region: defaultRegion || "",
        platform,
      }),
    });
    const data = await response.json().catch(() => ({}));

    if (response.status === 503 && data.fallback_to_legacy) {
      return {
        success: false,
        provider: "",
        sessionId: null,
        expiresInSeconds: 0,
        clientHint: {},
        fallbackToLegacy: true,
        error: data.error || "v2-disabled",
      };
    }

    return {
      success: Boolean(data.success),
      provider: data.provider || "",
      sessionId: data.session_id || null,
      expiresInSeconds: data.expires_in_seconds || 300,
      clientHint: data.client_hint || {},
      fallbackToLegacy: false,
      error: data.error || null,
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[otpV2] request-otp network error, falling back:", err?.message);
    return {
      success: false,
      provider: "",
      sessionId: null,
      expiresInSeconds: 0,
      clientHint: {},
      fallbackToLegacy: true,
      error: "network-error",
    };
  }
}

export async function verifyOtp({
  phone,
  provider,
  code,
  sessionId,
  firebaseIdToken,
  defaultRegion,
}) {
  try {
    const body = {
      phone,
      provider,
      default_region: defaultRegion || "",
      // CRITICAL: tells backend to look in DeliveryDriverProfile
      // rather than Users or regular ProfessionalUser. JWT returned
      // will carry user_type="delivery_driver" so downstream
      // /api/v1/delivery/* endpoints authenticate the driver.
      user_type: "delivery_driver",
    };
    if (code) body.code = code;
    if (sessionId) body.session_id = sessionId;
    if (firebaseIdToken) body.firebase_id_token = firebaseIdToken;

    const response = await fetch(`${apiBase()}/auth/v2/verify-otp/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));

    if (response.status === 503 && data.fallback_to_legacy) {
      return {
        success: false,
        provider,
        phoneE164: null,
        firebaseUid: null,
        accessToken: null,
        refreshToken: null,
        userId: null,
        userType: null,
        userFound: false,
        fallbackToLegacy: true,
        error: data.error || "v2-disabled",
      };
    }

    return {
      success: Boolean(data.success),
      provider: data.provider || provider,
      phoneE164: data.phone_e164 || null,
      firebaseUid: data.firebase_uid || null,
      accessToken: data.access_token || null,
      refreshToken: data.refresh_token || null,
      userId: data.user_id || null,
      userType: data.user_type || "delivery_driver",
      userFound: Boolean(data.user_found),
      fallbackToLegacy: false,
      error: data.error || null,
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[otpV2] verify-otp network error, falling back:", err?.message);
    return {
      success: false,
      provider,
      phoneE164: null,
      firebaseUid: null,
      accessToken: null,
      refreshToken: null,
      userId: null,
      userType: null,
      userFound: false,
      fallbackToLegacy: true,
      error: "network-error",
    };
  }
}
