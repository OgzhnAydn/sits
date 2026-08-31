import { NextRequest, NextResponse } from "next/server";
import { limitAsildi } from "@/lib/rateLimit";
import { seonEmail } from "@/lib/seon";

export const runtime = "nodejs";

// E-posta veri-ihlali kontrolü (XposedOrNot — ücretsiz, anahtarsız).
// E-postayı SAKLAMAYIZ; yalnızca sorgulayıp sonucu döndürürüz.
export async function POST(req: NextRequest) {
  const limit = limitAsildi(req, "sizinti", 20);
  if (limit) return limit;

  const { email } = await req.json();
  const e = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    return NextResponse.json({ hata: "Geçerli bir e-posta girin." }, { status: 400 });
  }

  try {
    const ipqsKey = process.env.IPQS_KEY;
    // DÖRT kaynağı PARALEL: XposedOrNot check-email (ihlal adları) + breach-analytics
    // (her ihlalin YIL + ne sızdı detayı) + LeakCheck (veri türü) + IPQS (itibar).
    const [xor, analiz, leak, ipqs, seon] = await Promise.all([
      fetch(`https://api.xposedornot.com/v1/check-email/${encodeURIComponent(e)}`, {
        headers: { "User-Agent": "Mozilla/5.0", accept: "application/json" },
        signal: AbortSignal.timeout(9000),
      }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`https://api.xposedornot.com/v1/breach-analytics?email=${encodeURIComponent(e)}`, {
        headers: { "User-Agent": "Mozilla/5.0", accept: "application/json" },
        signal: AbortSignal.timeout(9000),
      }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`https://leakcheck.io/api/public?check=${encodeURIComponent(e)}`, {
        headers: { "User-Agent": "Mozilla/5.0", accept: "application/json" },
        signal: AbortSignal.timeout(9000),
      }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ipqsKey
        ? fetch(`https://ipqualityscore.com/api/json/email/${ipqsKey}/${encodeURIComponent(e)}`, { signal: AbortSignal.timeout(9000) })
            .then((r) => (r.ok ? r.json() : null)).catch(() => null)
        : Promise.resolve(null),
      seonEmail(e), // SEON dijital ayak izi (anahtar varsa) — hangi platformlarda kayıtlı
    ]);

    const liste: string[] = Array.isArray(xor?.breaches?.[0]) ? xor.breaches[0] : [];

    // Her ihlalin DETAYI: ad + yıl + o ihlalde tam ne sızdı (şifre sızanlar öne).
    type Ham = { breach?: string; domain?: string; xposed_date?: string; xposed_data?: string; xposed_records?: number };
    const hamDetay: Ham[] = Array.isArray(analiz?.ExposedBreaches?.breaches_details)
      ? analiz.ExposedBreaches.breaches_details
      : [];
    const detaylar = hamDetay
      .map((b) => {
        const veriler = String(b.xposed_data || "")
          .split(";")
          .map((v) => VERI_TR[v.trim()] || null)
          .filter((v): v is string => Boolean(v));
        const benzersizVeri = [...new Set(veriler)];
        const yilM = String(b.xposed_date || "").match(/\d{4}/);
        return {
          ad: String(b.breach || "").trim() || "Bilinmeyen sızıntı",
          alan: String(b.domain || "").trim() || undefined,
          yil: yilM ? yilM[0] : undefined,
          veriler: benzersizVeri,
          sifreVar: benzersizVeri.includes("şifre"),
          kayit: Number(b.xposed_records) || 0,
        };
      })
      .filter((d) => d.ad !== "Bilinmeyen sızıntı" || d.veriler.length)
      // Şifre sızanlar en üste, sonra en yeni yıl, sonra en çok kayıt.
      .sort((a, b) =>
        Number(b.sifreVar) - Number(a.sifreVar) ||
        (b.yil || "0").localeCompare(a.yil || "0") ||
        b.kayit - a.kayit
      );
    const sifreliSizinti = detaylar.filter((d) => d.sifreVar).length;

    const leakFound = Number(leak?.found || 0);
    const alanlar: string[] = Array.isArray(leak?.fields) ? leak.fields : [];
    const veriTurleri = [...new Set(alanlar.map((a) => ALAN_TR[a] || null).filter(Boolean))] as string[];

    // IPQS itibar sinyalleri
    const itibar = ipqs?.success
      ? {
          disposable: !!ipqs.disposable,
          fraudSkoru: Number(ipqs.fraud_score || 0),
          recentAbuse: !!ipqs.recent_abuse,
          gecerli: ipqs.valid !== false,
        }
      : null;

    const bulundu = liste.length > 0 || leakFound > 0 || detaylar.length > 0;
    // SEON dijital ayak izi: e-posta hangi platformlarda kayıtlı + risk skoru.
    const footprint = seon && seon.platformlar.length
      ? { platformlar: seon.platformlar, skor: seon.skor }
      : null;
    return NextResponse.json({
      bulundu,
      // İHLAL sayısı (kayıt değil): XposedOrNot ad listesi otoriter; yoksa detay/LeakCheck.
      adet: bulundu ? (Math.max(liste.length, detaylar.length) || leakFound) : 0,
      sizintilar: bulundu ? liste.slice(0, 40) : [],
      detaylar: bulundu ? detaylar.slice(0, 60) : [], // ad + yıl + ne sızdı (şifre öne)
      sifreliSizinti: bulundu ? sifreliSizinti : 0, // kaç ihlalde ŞİFRE sızdı
      veriTurleri: bulundu ? veriTurleri : [],
      itibar, // kullan-at / fraud skoru / recent_abuse
      footprint, // SEON: kayıtlı platformlar + skor (anahtar varsa)
    });
  } catch {
    return NextResponse.json({ hata: "İhlal servisi şu an yanıt vermedi, tekrar dene." }, { status: 502 });
  }
}

// XposedOrNot "xposed_data" etiketlerini sade Türkçeye çevir (kritik olanlar).
// Tanınmayan/önemsiz alanlar (ör. "Job titles") gösterilmez → SADE kalır.
const VERI_TR: Record<string, string> = {
  "Passwords": "şifre",
  "Email addresses": "e-posta",
  "Usernames": "kullanıcı adı",
  "Names": "ad-soyad",
  "Phone numbers": "telefon",
  "Physical addresses": "adres",
  "Dates of birth": "doğum tarihi",
  "Credit cards": "kredi kartı",
  "Partial credit card data": "kredi kartı (kısmi)",
  "Bank account numbers": "banka hesabı",
  "Social security numbers": "kimlik no",
  "Government issued IDs": "kimlik no",
  "IP addresses": "IP adresi",
  "Geographic locations": "konum",
  "Genders": "cinsiyet",
  "Security questions and answers": "güvenlik sorusu",
  "Historical passwords": "eski şifre",
  "Password hints": "şifre ipucu",
  "Auth tokens": "oturum anahtarı",
};

// LeakCheck alan adlarını sade Türkçeye çevir (en kritik olanlar öne).
const ALAN_TR: Record<string, string> = {
  password: "şifre", email: "e-posta", username: "kullanıcı adı",
  phone: "telefon", address: "adres", name: "ad-soyad",
  first_name: "ad-soyad", last_name: "ad-soyad", middle_name: "ad-soyad",
  dob: "doğum tarihi", ssn: "kimlik no", credit_card: "kredi kartı",
  ip: "IP adresi", ip1: "IP adresi", ip2: "IP adresi",
  zip: "posta kodu", gender: "cinsiyet", country: "konum",
  state: "konum", city: "konum", company_name: "şirket", profile_name: "profil",
};
