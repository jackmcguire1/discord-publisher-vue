import { initializeApp } from "firebase/app";
import { initializeAuth, browserLocalPersistence, connectAuthEmulator } from "firebase/auth";
import { initializeFirestore, connectFirestoreEmulator, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

// Config comes from .env (production) or .env.development (emulators). None of
// it is secret; the security rules in firebase/ are what protect the data.
const env = import.meta.env;

export const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});

// localStorage persistence (rather than the IndexedDB default) keeps sign-in
// state somewhere the e2e suite clears between tests.
export const auth = initializeAuth(app, { persistence: browserLocalPersistence });

// Editor state carries optional fields as `undefined`; Firestore should drop them.
// The persistent cache (IndexedDB, shared between tabs) lets reloads start from
// what's already on this device and fetch only changes; signOut() clears it.
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export const usingEmulators = env.VITE_FIREBASE_EMULATORS === "true";

if (usingEmulators) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
