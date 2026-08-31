import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.appspot.com`,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Anahtarlar tanımlı mı? Değilse uygulama demo modda çalışır.
export const firebaseHazir = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId
);

const app: FirebaseApp | null = firebaseHazir
  ? getApps().length
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;

// App Check (bot/otomasyon koruması) — sadece TARAYICIDA ve site key varsa.
// Sunucu tarafında (API route'ları) çalışmaz; orada zaten client SDK'yı biz kullanırız.
if (app && typeof window !== "undefined") {
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  if (siteKey) {
    import("firebase/app-check")
      .then(({ initializeAppCheck, ReCaptchaV3Provider }) => {
        try {
          initializeAppCheck(app, {
            provider: new ReCaptchaV3Provider(siteKey),
            isTokenAutoRefreshEnabled: true,
          });
        } catch {
          // App Check kurulamazsa sessiz geç (uygulama çalışmaya devam etsin)
        }
      })
      .catch(() => {});
  }
}

export const db = app ? getFirestore(app) : null;

// Marka girişi (Firebase Auth) — yalnız tarayıcıda, app hazırsa.
import { getAuth, type Auth } from "firebase/auth";
export const auth: Auth | null = app ? getAuth(app) : null;
