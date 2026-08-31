// MARKA GİRİŞİ — Firebase Auth (e-posta/parola) + marka_hesaplari eşlemesi.
// Her hesap uid → {marka} ile bir markaya bağlanır; /mercek o markaya kilitlenir.
// marka="*" → operatör (tüm markalar). Sunucu-tarafı tam izolasyon için Faz 2 (Admin SDK).
"use client";
import { auth, db, firebaseHazir } from "./firebase";
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  onAuthStateChanged, type User,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

export type MarkaHesap = { marka: string; ad: string; email?: string };

export async function girisYap(email: string, sifre: string): Promise<void> {
  if (!auth) throw new Error("Auth hazır değil");
  await signInWithEmailAndPassword(auth, email.trim(), sifre);
}

// Kayıt: RESMÎ adreslerden marka anahtarı türetilir + allowlist'e yazılır (kullanici_markalari),
// sonra hesap o markaya bağlanır. Böylece resmî adresler DIŞINDaki her taklit sahte sayılır.
export async function kayitOl(email: string, sifre: string, ad: string, resmiMetin: string): Promise<string> {
  if (!auth || !db) throw new Error("Auth hazır değil");
  // 1) Resmî adresleri kaydet + marka anahtarını al (auth gerekmez).
  const r = await fetch("/api/marka-kayit", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ad, resmi: resmiMetin, email }),
  });
  const j = await r.json();
  if (!r.ok || !j.anahtar) throw new Error(j.hata || "Resmî adresler kaydedilemedi.");
  // 2) Hesabı oluştur + markaya kilitle.
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), sifre);
  await setDoc(doc(db, "marka_hesaplari", cred.user.uid), {
    marka: String(j.anahtar).toLowerCase(), ad: (ad || j.markaAdi || j.anahtar).trim(), email: email.trim(), olusturma: serverTimestamp(),
  });
  return j.anahtar;
}

export async function cikis(): Promise<void> { if (auth) await signOut(auth); }

export async function markamGetir(uid: string): Promise<MarkaHesap | null> {
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, "marka_hesaplari", uid));
    if (!snap.exists()) return null;
    const d = snap.data() as MarkaHesap;
    return { marka: d.marka, ad: d.ad, email: d.email };
  } catch { return null; }
}

// Auth durumunu dinle → oturum açık kullanıcıyı ve markasını verir.
export function markaDinle(cb: (user: User | null, hesap: MarkaHesap | null) => void): () => void {
  if (!firebaseHazir || !auth) { cb(null, null); return () => {}; }
  return onAuthStateChanged(auth, async (user) => {
    if (!user) { cb(null, null); return; }
    const hesap = await markamGetir(user.uid);
    cb(user, hesap);
  });
}
