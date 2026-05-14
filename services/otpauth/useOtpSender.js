/**
 * useOtpSender hook for Livraison_pearl (Expo managed).
 *
 * Same API as the hooks in AppUser / AppPro / WebsiteUser / WebsitePro /
 * Liste_Pearl — kept duplicated because there's no shared-package setup.
 *
 * Firebase in Expo requires a reCAPTCHA verifier to send the SMS. The
 * caller must pass a `recaptchaVerifier` ref pointing at a mounted
 * <FirebaseRecaptchaVerifierModal /> (from expo-firebase-recaptcha).
 * When the ref is absent OR Firebase config is missing, the hook
 * returns `shouldFallback=true` so the caller keeps the legacy
 * email/password path — zero regression.
 *
 * Usage:
 *   const recaptchaVerifier = useRef(null);
 *   const { sendOtp, verifyOtp, ... } =
 *     useOtpSender({ platform: "app-delivery", recaptchaVerifier });
 *
 *   // Inside JSX:
 *   <FirebaseRecaptchaVerifierModal ref={recaptchaVerifier} firebaseConfig={...} />
 *
 *   const ok = await sendOtp({ phone: "+33612345678", channel: "sms" });
 *   if (!ok) return; // error state set
 *   const result = await verifyOtp({ code: "123456" });
 */
import { useCallback, useRef, useState } from "react";
import { requestOtp as apiRequestOtp, verifyOtp as apiVerifyOtp } from "./otpV2Client";
import { getFirebaseApp, isFirebaseConfigured } from "./firebase";

export default function useOtpSender({ platform = "app-delivery", recaptchaVerifier } = {}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [provider, setProvider] = useState(null);
  const [shouldFallback, setShouldFallback] = useState(false);
  const sessionRef = useRef({});

  const sendOtp = useCallback(
    async ({ phone, channel = "sms", defaultRegion }) => {
      setLoading(true);
      setError(null);
      setShouldFallback(false);
      setProvider(null);

      const result = await apiRequestOtp({ phone, channel, defaultRegion, platform });

      if (result.fallbackToLegacy) {
        setShouldFallback(true);
        setLoading(false);
        return false;
      }
      if (!result.success) {
        setError(result.error || "send-failed");
        setLoading(false);
        return false;
      }

      if (result.provider === "firebase") {
        if (!isFirebaseConfigured()) {
          setShouldFallback(true);
          setLoading(false);
          return false;
        }
        const verifier = recaptchaVerifier?.current || null;
        if (!verifier) {
          // eslint-disable-next-line no-console
          console.warn("[otpV2] recaptcha verifier not mounted — falling back");
          setShouldFallback(true);
          setLoading(false);
          return false;
        }
        try {
          const app = await getFirebaseApp();
          if (!app) {
            setShouldFallback(true);
            setLoading(false);
            return false;
          }
          const { getAuth, signInWithPhoneNumber } = await import("firebase/auth");
          const auth = getAuth(app);
          const confirmation = await signInWithPhoneNumber(auth, phone, verifier);
          sessionRef.current = { provider: "firebase", phone, confirmation };
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("[otpV2] firebase send error, falling back:", err?.message);
          setShouldFallback(true);
          setLoading(false);
          return false;
        }
      } else {
        // whatsapp — backend sent the code, we hold the session id
        sessionRef.current = {
          provider: result.provider,
          phone,
          sessionId: result.sessionId,
        };
      }

      setProvider(result.provider);
      setLoading(false);
      return true;
    },
    [platform, recaptchaVerifier]
  );

  const verifyOtp = useCallback(async ({ code }) => {
    setLoading(true);
    setError(null);
    const { provider: p, phone, confirmation, sessionId } = sessionRef.current;
    if (!p || !phone) {
      setError("no-active-session");
      setLoading(false);
      return null;
    }

    const payload = { phone, provider: p };
    if (p === "firebase") {
      try {
        const credential = await confirmation.confirm(code);
        const idToken = await credential.user.getIdToken();
        payload.firebaseIdToken = idToken;
      } catch (err) {
        setError(`firebase-verify: ${err.code || err.message}`);
        setLoading(false);
        return null;
      }
    } else {
      payload.code = code;
      payload.sessionId = sessionId;
    }

    const result = await apiVerifyOtp(payload);
    if (result.fallbackToLegacy) {
      setShouldFallback(true);
      setLoading(false);
      return null;
    }
    if (!result.success) {
      setError(result.error || "verify-failed");
      setLoading(false);
      return null;
    }
    setLoading(false);
    sessionRef.current = {};
    return result;
  }, []);

  const reset = useCallback(() => {
    sessionRef.current = {};
    setLoading(false);
    setError(null);
    setProvider(null);
    setShouldFallback(false);
  }, []);

  return { sendOtp, verifyOtp, reset, provider, loading, error, shouldFallback };
}
