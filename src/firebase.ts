import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  User as FirebaseSdkUser
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy
} from "firebase/firestore";

export const SUPER_ADMIN_EMAIL = "fabien.frikupgeneration@gmail.com";
export const DEFAULT_SUPER_ADMIN_PIN = "0000";

const firebaseConfig = {
  apiKey: "AIzaSyBcbHyFN15fHKtQLtW5bXeKNUJYBFU38EI",
  authDomain: "faab-projet.firebaseapp.com",
  projectId: "faab-projet",
  storageBucket: "faab-projet.firebasestorage.app",
  messagingSenderId: "739874836052",
  appId: "1:739874836052:web:acccab79a9f632a00ba7c1"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export interface FirebaseUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  providers?: string[];
  creationTime?: string | null;
  lastSignInTime?: string | null;
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
}

export function mapFirebaseSdkUser(user: FirebaseSdkUser): FirebaseUser {
  const providers = Array.from(
    new Set(
      (user.providerData || [])
        .map(p => p?.providerId)
        .filter((id): id is string => Boolean(id))
    )
  );
  if (providers.length === 0) {
    providers.push("google.com");
  }

  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    providers,
    creationTime: user.metadata?.creationTime || new Date().toISOString(),
    lastSignInTime: user.metadata?.lastSignInTime || new Date().toISOString()
  };
}

export {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy
};
