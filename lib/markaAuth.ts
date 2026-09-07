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

// ── OPERATÖR (platform sahibi) GİRİŞİ — Firebase'siz, basit erişim ──
// GÜVENLİK UYARISI: admin/admin ZAYIF bir paroladır; site herkese açık olduğundan
// bunu bilen HERKES tüm markaların panosuna girebilir. Üretimde mutlaka güçlü bir
// parolayla değiştir (aşağıdaki OP_PAROLA). marka="*" → tüm markalar (operatör).
const OP_KEY = "mrl_op";
const OP_KULLANICI = "admin";
const OP_PAROLA = "admin";
export function operatorGiris(email: string, sifre: string): boolean {
  const e = email.trim().toLowerCase();
  if ((e === OP_KULLANICI || e === `${OP_KULLANICI}@mirleon.ai`) && sifre === OP_PAROLA) {
    try { localStorage.setItem(OP_KEY, "1"); } catch { /* yok say */ }
    return true;
  }
  return false;
}
export function operatorMu(): boolean {
  try { return typeof window !== "undefined" && localStorage.getItem(OP_KEY) === "1"; } catch { return false; }
}

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

export async function cikis(): Promise<void> {
  try { localStorage.removeItem(OP_KEY); } catch { /* yok say */ }
  if (auth) await signOut(auth);
}

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
  // Operatör oturumu (admin girişi) → Firebase'i atla, tüm markalara erişim ver.
  if (operatorMu()) { cb({ uid: "operator" } as User, { marka: "*", ad: "Operatör" }); return () => {}; }
  if (!firebaseHazir || !auth) { cb(null, null); return () => {}; }
  return onAuthStateChanged(auth, async (user) => {
    if (!user) { cb(null, null); return; }
    const hesap = await markamGetir(user.uid);
    cb(user, hesap);
  });
}
