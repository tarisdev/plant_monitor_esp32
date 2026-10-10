import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

/* ---------- firebase (config from web/.env, see .env.example) ---------- */
const env = import.meta.env;
const required = (key: string) => {
  const value: unknown = env[key];
  if (typeof value !== "string" || value === "") {
    throw new Error(`Missing ${key} — add it to web/.env (template: web/.env.example)`);
  }
  return value;
};

export const db = getFirestore(
  initializeApp({
    apiKey: required("VITE_FIREBASE_API_KEY"),
    authDomain: required("VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: required("VITE_FIREBASE_PROJECT_ID"),
    storageBucket: required("VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: required("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: required("VITE_FIREBASE_APP_ID"),
    measurementId: env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined,
  }),
);
