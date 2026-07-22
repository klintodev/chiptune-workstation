export const FIREBASE_PROJECT_NUMBER = "466489590439";

// Firebase web configuration contains public project identifiers. Firestore
// Security Rules, not secrecy of these values, enforce authorization.
export const FIREBASE_CONFIG = Object.freeze({
  apiKey: "AIzaSyAy3sOMC9ZWoHo_VSNxswBWEhTHPYKz95k",
  appId: "1:466489590439:web:9186597eb49aec442f5182",
  authDomain: "klinto-studio.firebaseapp.com",
  measurementId: "G-9NJH1QFF7T",
  messagingSenderId: FIREBASE_PROJECT_NUMBER,
  projectId: "klinto-studio",
  storageBucket: "klinto-studio.firebasestorage.app",
});

// App Check site keys are public identifiers. Leave this empty until the web
// app is registered with reCAPTCHA Enterprise; do not enable console
// enforcement before the configured build has been deployed and monitored.
export const FIREBASE_APP_CHECK_CONFIG = Object.freeze({
  siteKey: "",
});

export function isFirebaseConfigured(config = FIREBASE_CONFIG) {
  return Boolean(
    config?.apiKey
    && config?.appId
    && config?.authDomain
    && config?.projectId,
  );
}
