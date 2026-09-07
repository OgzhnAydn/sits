import {
  collection,
  addDoc,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit as fbLimit,
  increment,
  arrayUnion,
  serverTimestamp,
} from "firebase/firestore";
import { db, firebaseHazir } from "./firebase";
import { gercekTaklit } from "./korunanMarkalar";
import { usomBilgi } from "./tehditListeleri";
import type { Analiz } from "./analyze";

function belgeId(tip: string, deger: string) {
  return `${tip}_${deger.toLowerCase().replace(/[^a-z0-9]/g, "")}`.slice(0, 200);
}

export type SorguSonuc = {
  bulundu: boolean;
  bildirimSayisi: number; // toplam bildirim (legacy)
  benzersiz: number; // FARKLI bildiren sayısı (eşik bunun üzerinden)
  kategori: string | null;
};

export async function gostergeSorgula(
  deger: string,
  tip: string
): Promise<SorguSonuc | null> {
  if (!firebaseHazir || !db) return null;
  const snap = await getDoc(doc(db, "gostergeler", belgeId(tip, deger)));
  if (!snap.exists())
    return { bulundu: false, bildirimSayisi: 0, benzersiz: 0, kategori: null };
  const d = snap.data();
  const benzersiz = Array.isArray(d.bildirenler)
    ? d.bildirenler.length
    : d.bildirimSayisi ?? 1;
  return {
    bulundu: true,
    bildirimSayisi: d.bildirimSayisi ?? 1,
    benzersiz,
    kategori: d.kategori ?? null,
  };
}

// Bir göstergeyi SORGULAYAN (soran) kişiyi say — bildirimden farklı: soru
// çoktur, bildirim azdır. "Bunu ilk soran sensin" / "senden önce N kişi sordu".
// bildiren alanlarına DOKUNMAZ (temiz bir sorgu, kara liste sinyali üretmez).
export async function sorguKaydet(
  deger: string,
  tip: string,
  soranId: string
): Promise<{ oncekiSoran: number; benzersizBildiren: number }> {
  if (!firebaseHazir || !db) return { oncekiSoran: 0, benzersizBildiren: 0 };
  try {
    const ref = doc(db, "gostergeler", belgeId(tip, deger));
    const snap = await getDoc(ref);
    const d = snap.exists() ? snap.data() : {};
    const id = soranId || "anon";
    const soranlar: string[] = Array.isArray(d.soranlar) ? d.soranlar : [];
    const oncekiSoran = soranlar.filter((s) => s !== id).length; // benden önceki FARKLI soranlar
    const benzersizBildiren = Array.isArray(d.bildirenler)
      ? d.bildirenler.length
      : d.bildirimSayisi ?? 0;
    await setDoc(
      ref,
      { deger, tip, soranlar: arrayUnion(id), sorulmaSayisi: increment(1), sonSorgu: serverTimestamp() },
      { merge: true }
    );
    return { oncekiSoran, benzersizBildiren };
  } catch {
    return { oncekiSoran: 0, benzersizBildiren: 0 };
  }
}

// Kampanya imzasını kaydet (domainden bağımsız kalıp). Bir tuzak bildirildiğinde
// ya da motor yüksek riskli bulduğunda çağrılır; farklı kaynakları sayar.
export async function kampanyaKaydet(
  imza: string,
  ornek: string,
  yol: string | null,
  kaynakId: string
): Promise<void> {
  if (!firebaseHazir || !db) return;
  try {
    await setDoc(
      doc(db, "kampanyalar", imza),
      {
        ornek: ornek.slice(0, 300),
        yol: yol ?? null,
        sayi: increment(1),
        kaynaklar: arrayUnion(kaynakId || "anon"),
        sonGorulme: serverTimestamp(),
      },
      { merge: true }
    );
  } catch {}
}

export type KampanyaEslesme = { benzersiz: number; sayi: number; ornek: string | null };

// Bu imza daha önce görülmüş mü? "Bilinen kampanya — adres değişmiş" kararı için.
export async function kampanyaSorgula(imza: string): Promise<KampanyaEslesme | null> {
  if (!firebaseHazir || !db) return null;
  try {
    const snap = await getDoc(doc(db, "kampanyalar", imza));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      benzersiz: Array.isArray(d.kaynaklar) ? d.kaynaklar.length : d.sayi ?? 1,
      sayi: d.sayi ?? 1,
      ornek: d.ornek ?? null,
    };
  } catch {
    return null;
  }
}

export async function bildirimKaydet(
  analiz: Analiz,
  referansNo: string,
  bildirenId: string
): Promise<boolean> {
  if (!firebaseHazir || !db) return false;
  const fdb = db;
  const bId = bildirenId || "anon";

  await addDoc(collection(fdb, "bildirimler"), {
    referansNo,
    kategori: analiz.kategori,
    kategoriAdi: analiz.kategoriAdi,
    ozet: analiz.ozet,
    gostergeler: analiz.gostergeler,
    kurumlar: analiz.kurumlar,
    bildirenId: bId,
    tarih: serverTimestamp(),
  });

  const g = analiz.gostergeler;
  const kayitlar: { tip: string; deger: string }[] = [
    ...g.url.map((v) => ({ tip: "url", deger: v })),
    ...g.iban.map((v) => ({ tip: "iban", deger: v })),
    ...g.telefon.map((v) => ({ tip: "telefon", deger: v })),
    ...(g.kripto || []).map((v) => ({ tip: "kripto", deger: v })),
  ];

  await Promise.all(
    kayitlar.map((k) => {
      // Aynı bildirimdeki DİĞER göstergelerle bağ kur (kampanya grafiği).
      const bagli: Record<string, unknown> = {};
      for (const o of kayitlar) {
        if (o === k) continue;
        bagli[belgeId(o.tip, o.deger)] = { deger: o.deger, tip: o.tip, sayi: increment(1) };
      }
      return setDoc(
        doc(fdb, "gostergeler", belgeId(k.tip, k.deger)),
        {
          deger: k.deger,
          tip: k.tip,
          kategori: analiz.kategoriAdi,
          bildirimSayisi: increment(1),
          bildirenler: arrayUnion(bId),
          sonBildirim: serverTimestamp(),
          ...(Object.keys(bagli).length ? { bagli } : {}),
        },
        { merge: true }
      );
    })
  );

  return true;
}

export type GostergeOzet = { deger: string; tip: string; kategori: string | null; benzersiz: number; sayi: number };

// En son bildirilen göstergeler (trend/kampanya istihbaratı için).
export async function sonGostergeler(adet = 150): Promise<GostergeOzet[]> {
  if (!firebaseHazir || !db) return [];
  try {
    const q = query(collection(db, "gostergeler"), orderBy("sonBildirim", "desc"), fbLimit(adet));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const x = d.data();
      return {
        deger: String(x.deger ?? ""),
        tip: String(x.tip ?? "url"),
        kategori: x.kategori ?? null,
        benzersiz: Array.isArray(x.bildirenler) ? x.bildirenler.length : x.bildirimSayisi ?? 1,
        sayi: x.bildirimSayisi ?? 1,
      };
    });
  } catch {
    return [];
  }
}

// Paylaşılan içeriğin kendisini (metin/link) tekilleştirip kaç FARKLI kişinin
// bildirdiğini tutar → "bu içerik daha önce N kişi tarafından bildirildi".
function icerikId(icerik: string): string {
  const s = icerik.toLowerCase().replace(/\s+/g, " ").trim().replace(/[^a-z0-9]/g, "");
  return ("p_" + (s || "bos")).slice(0, 200);
}

export async function paylasimKaydet(icerik: string, cihazId: string): Promise<number> {
  if (!firebaseHazir || !db) return 0;
  try {
    const ref = doc(db, "paylasimlar", icerikId(icerik));
    await setDoc(
      ref,
      { ornek: icerik.slice(0, 300), sayi: increment(1), bildirenler: arrayUnion(cihazId || "anon"), sonPaylasim: serverTimestamp() },
      { merge: true }
    );
    const snap = await getDoc(ref);
    const d = snap.data();
    return Array.isArray(d?.bildirenler) ? d.bildirenler.length : d?.sayi ?? 1;
  } catch {
    return 0;
  }
}

export type KampanyaDugum = { id: string; deger: string; tip: string; kategori: string | null; benzersiz: number; komsu: string[] };

// Kampanya kümeleme için: son göstergeler + birlikte-bildirim (bagli) kenarları.
export async function kampanyaVerisi(adet = 200): Promise<KampanyaDugum[]> {
  if (!firebaseHazir || !db) return [];
  try {
    const q = query(collection(db, "gostergeler"), orderBy("sonBildirim", "desc"), fbLimit(adet));
    const snap = await getDocs(q);
    return snap.docs.map((doc) => {
      const x = doc.data();
      const bagli = (x.bagli as Record<string, unknown>) || {};
      return {
        id: doc.id,
        deger: String(x.deger ?? ""),
        tip: String(x.tip ?? "url"),
        kategori: x.kategori ?? null,
        benzersiz: Array.isArray(x.bildirenler) ? x.bildirenler.length : x.bildirimSayisi ?? 1,
        komsu: Object.keys(bagli),
      };
    });
  } catch {
    return [];
  }
}

// Bir göstergeyle BİRLİKTE bildirilen diğer göstergeler (kampanya bağı).
// ── Marka Taklit Avcısı — CertStream'den yakalanan sahte-site adayları ──────
export type MarkaAday = {
  domain: string;
  marka: string;
  markaAdi: string;
  skor: number;
  seviye: string;
  sinyaller: string[];
  kaynak: string;
  zaman: number;
  durum?: "aktif-tuzak" | "park" | "yayinda-degil" | "canli"; // canlı durum (park'lar ayrı takip)
  kampanya?: { domainSayisi: number; ipler: string[]; asnler: string[]; iletisimKanallari: string[]; exfilVar: boolean; ozet: string }; // operasyon haritası özeti
  cikisAni?: number; // sahte adresin DOĞUŞ anı (ms, en eski sertifika). zaman = TESPİT anı. Gecikme = zaman − cikisAni.
};

export async function markaAdayKaydet(a: MarkaAday): Promise<void> {
  if (!firebaseHazir || !db) return;
  try {
    const ref = doc(db, "marka_adaylari", belgeId("dom", a.domain));
    // İLK-BULUNMA zamanını KORU: aynı domain yeniden tespit edilince (sahte-bul,
    // certstream re-hit, vercel-tarama) `zaman`/`olusturma` ÜZERİNE YAZMA — yoksa
    // eski bulgu "yeni bulundu" gibi görünür. Re-tespit yalnız sonTarama'yı günceller.
    const mevcut = await getDoc(ref);
    const veri: Record<string, unknown> = { ...a, sonTarama: Date.now() };
    if (mevcut.exists()) {
      const d = mevcut.data() as { zaman?: number; olusturma?: unknown };
      if (typeof d.zaman === "number" && d.zaman > 0) veri.zaman = d.zaman; // ilk bulunma korunur
      if (d.olusturma) delete (veri as { olusturma?: unknown }).olusturma; // olusturma'yı ezme
    } else {
      veri.olusturma = serverTimestamp(); // yalnız İLK oluşturmada
    }
    await setDoc(ref, veri, { merge: true });
  } catch {
    /* kurallar yayınlanmadıysa sessiz geç */
  }
}

// MÜŞTERİ-BAZLI TESPİT ÖZETİ — "markanız için şu kadar tehdit tespit ettik".
// Bir markanın tüm tespitlerini (yanlış-pozitif süzülü) toplar: toplam, aktif, park,
// yüksek-riskli, operasyon (kampanya) sayısı + son tespitler.
export type MarkaOzet = { toplam: number; aktif: number; park: number; yuksek: number; operasyon: number; canli: number; kumeTld: string; kumeAdet: number; ayri: number; sonlar: MarkaAday[] };
export async function markaTespitOzeti(marka: string): Promise<MarkaOzet> {
  const bos: MarkaOzet = { toplam: 0, aktif: 0, park: 0, yuksek: 0, operasyon: 0, canli: 0, kumeTld: "", kumeAdet: 0, ayri: 0, sonlar: [] };
  if (!firebaseHazir || !db || !marka) return bos;
  try {
    // orderBy YOK → composite index gerekmesin; sıralamayı JS'te yap.
    const snap = await getDocs(query(collection(db, "marka_adaylari"), where("marka", "==", marka), fbLimit(500)));
    const hepsi = snap.docs.map((d) => d.data() as MarkaAday).filter((a) => gercekTaklit(a.domain, a.marka)).sort((a, b) => (b.zaman || 0) - (a.zaman || 0));
    // PARK KÜMESİ tespiti: tek TLD son-ekinde yoğunlaşan toplu-kayıt (tek operasyon) →
    // 56 park domaini ayrı ayrı "tehdit" saymak sayıyı şişirir; kümeyi TEK operasyon gibi ayır.
    const tldSay: Record<string, number> = {};
    for (const a of hepsi) { const t = (a.domain.split(".").pop() || "").toLowerCase(); tldSay[t] = (tldSay[t] || 0) + 1; }
    const enKalabalik = Object.entries(tldSay).sort((x, y) => y[1] - x[1])[0];
    const kumeVar = !!enKalabalik && enKalabalik[1] >= 5 && enKalabalik[1] / hepsi.length > 0.4;
    const kumeTld = kumeVar ? enKalabalik[0] : "";
    const kumeAdet = kumeVar ? enKalabalik[1] : 0;
    return {
      toplam: hepsi.length,
      aktif: hepsi.filter((a) => a.durum === "aktif-tuzak").length,
      park: hepsi.filter((a) => a.durum === "park").length,
      yuksek: hepsi.filter((a) => (a.skor || 0) >= 60).length,
      canli: hepsi.filter((a) => a.durum === "canli" || a.durum === "aktif-tuzak").length,
      operasyon: hepsi.filter((a) => a.kampanya && a.kampanya.domainSayisi > 1).length,
      kumeTld, kumeAdet, ayri: hepsi.length - kumeAdet,
      sonlar: hepsi.slice(0, 60),
    };
  } catch {
    return bos; // indeks yoksa (marka+zaman composite) sessiz boş dön
  }
}

// ERKENLİK PUANI — "USOM'dan (ve ilk kurbandan) kaç gün ÖNCE yakaladık?".
// Markanın adaylarını USOM ile karşılaştırır: biz-önce / USOM'da-yok / USOM-önce.
export type MarkaErkenlik = { toplam: number; bizOnce: number; usomdaYok: number; usomOnce: number; ortGun: number; ornekler: { domain: string; durum: "biz-once" | "usom-yok" | "usom-once"; gun?: number }[] };
export async function markaErkenlik(marka: string): Promise<MarkaErkenlik> {
  const bos: MarkaErkenlik = { toplam: 0, bizOnce: 0, usomdaYok: 0, usomOnce: 0, ortGun: 0, ornekler: [] };
  if (!firebaseHazir || !db || !marka) return bos;
  try {
    const snap = await getDocs(query(collection(db, "marka_adaylari"), where("marka", "==", marka), fbLimit(300)));
    const adaylar = snap.docs.map((d) => d.data() as MarkaAday)
      .filter((a) => gercekTaklit(a.domain, a.marka))
      .sort((a, b) => (b.zaman || 0) - (a.zaman || 0))
      .slice(0, 25); // USOM sorgusu maliyetli → en yeni 25 ile sınırla
    let bizOnce = 0, usomdaYok = 0, usomOnce = 0;
    const gunler: number[] = [];
    const ornekler: MarkaErkenlik["ornekler"] = [];
    // Paralel USOM sorguları (usomBilgi 1 saat cache'li).
    const sonuc = await Promise.all(adaylar.map(async (a) => ({ a, u: await usomBilgi(a.domain).catch(() => ({ listede: false } as { listede: boolean; tarih?: string })) })));
    for (const { a, u } of sonuc) {
      const bizMs = a.zaman || 0;
      if (!u.listede) {
        usomdaYok++;
        if (ornekler.length < 12) ornekler.push({ domain: a.domain, durum: "usom-yok" });
      } else {
        const usomMs = u.tarih ? Date.parse(u.tarih) : NaN;
        if (!isNaN(usomMs) && bizMs > 0 && bizMs < usomMs) {
          bizOnce++;
          const gun = Math.max(0, Math.round((usomMs - bizMs) / 86400000));
          gunler.push(gun);
          if (ornekler.length < 12) ornekler.push({ domain: a.domain, durum: "biz-once", gun });
        } else {
          usomOnce++;
          if (ornekler.length < 12) ornekler.push({ domain: a.domain, durum: "usom-once" });
        }
      }
    }
    const ortGun = gunler.length ? Math.round(gunler.reduce((x, y) => x + y, 0) / gunler.length) : 0;
    return { toplam: adaylar.length, bizOnce, usomdaYok, usomOnce, ortGun, ornekler };
  } catch {
    return bos;
  }
}

export async function markaAdaylariGetir(n = 60): Promise<MarkaAday[]> {
  if (!firebaseHazir || !db) return [];
  try {
    const snap = await getDocs(query(collection(db, "marka_adaylari"), orderBy("zaman", "desc"), fbLimit(n)));
    return snap.docs.map((d) => d.data() as MarkaAday);
  } catch {
    return [];
  }
}

// ── GOOGLE ADS (BigQuery Transparency) reklam cache'i — günlük birleşik sorgu
// sonucunu marka başına saklar (istek-başına BigQuery çağırma = maliyet). ──
// NOT: yeni koleksiyon (rules deploy) engelini aşmak için, zaten yazmaya-izinli
// gunluk_marka_stat koleksiyonunu "greklam_" önekli belge id ile kullanırız
// (kural: marka is string → verimiz uyuyor; markaGunlukGetir'in id deseniyle çakışmaz).
// tur: tehdit=marka adına finans/tam-ad reklamı (müşteriye) · inceleme=bayi/belirsiz ·
// ilgisiz=farklı işletme/konu (gizli) · resmi=Google-doğrulanmış (gerçek marka).
export type GoogleReklam = { reklamveren: string; yasal?: string; konum?: string; dogrulama: string; url?: string; supheli: boolean; tur?: "tehdit" | "inceleme" | "ilgisiz" | "resmi"; konu?: string };
const greklamId = (marka: string) => "greklam_" + belgeId("m", marka);
export async function googleReklamKaydet(marka: string, reklamlar: GoogleReklam[]): Promise<void> {
  if (!firebaseHazir || !db) return;
  try {
    await setDoc(doc(db, "gunluk_marka_stat", greklamId(marka)), { marka, reklamlar: reklamlar.slice(0, 60), guncelleme: Date.now() }, { merge: false });
  } catch { /* kurallar yoksa sessiz */ }
}
export async function googleReklamGetir(marka: string): Promise<{ reklamlar: GoogleReklam[]; guncelleme: number } | null> {
  if (!firebaseHazir || !db || !marka) return null;
  try {
    const s = await getDoc(doc(db, "gunluk_marka_stat", greklamId(marka)));
    if (!s.exists()) return null;
    const d = s.data() as { reklamlar?: GoogleReklam[]; guncelleme?: number };
    return { reklamlar: d.reklamlar || [], guncelleme: d.guncelleme || 0 };
  } catch { return null; }
}

// TEK MARKANIN adayları — marka-kilitli kokpit için. Global "en yeni N" listesi bir
// markayı (adayları eskiyse) tamamen kaçırabilir; bu, o markanın TÜM adaylarını getirir.
// orderBy YOK (composite index gerekmesin) → sıralama JS'te.
export async function markaAdaylariMarka(marka: string, n = 300): Promise<MarkaAday[]> {
  if (!firebaseHazir || !db || !marka) return [];
  try {
    const snap = await getDocs(query(collection(db, "marka_adaylari"), where("marka", "==", marka), fbLimit(n)));
    return snap.docs.map((d) => d.data() as MarkaAday).sort((a, b) => (b.zaman || 0) - (a.zaman || 0));
  } catch {
    return [];
  }
}

// ── Analiz sonuçları (KANIT DEPOSU: yakalanan link + analizimiz kalıcı) ──────
// Her domain analizi (osint / sahte-bul) buraya kaydedilir → geçmiş + tekrar-analiz yok.
export type AnalizKaydi = {
  domain: string;
  risk: number;
  seviye: string;
  bulgular: string[];
  ekranGoruntusu?: string;
  baslik?: string;
  kaynak: string; // "sorgu" | "sahte-bul" | "marka-aday" ...
  zaman: number;
  // ── Zenginleştirilmiş DELİL (opsiyonel — geriye uyumlu) ──
  alanlar?: { ad: string; deger: string }[]; // teknik istihbarat = delil artefaktları
  kategoriler?: { ad: string; seviye: string }[]; // suç türü değerlendirmesi
  dedektifTur?: string; // AI Dedektif hükmü türü
  dedektifGuven?: string;
  deliller?: string[]; // en güçlü somut delil başlıkları (klon, taklit, cert geçmişi…)
};

// Toplanan alanlardan EN GÜÇLÜ somut delilleri seç (kanıt dosyası için öz).
const DELIL_ALANLARI = [
  "Klon kaynağı", "Taklit uyarısı", "İçerikte kurum taklidi", "Logo taklidi (görsel)",
  "Yönlendirme zinciri", "Sertifika geçmişi", "Aynı IP'de", "SSL uyarısı", "Host uyarısı",
  "VirusTotal", "Marka taklidi güveni", "Site durumu",
];
export function delilCikar(alanlar?: { ad: string; deger: string }[]): string[] {
  if (!alanlar) return [];
  return alanlar
    .filter((a) => DELIL_ALANLARI.some((d) => a.ad.startsWith(d)))
    .map((a) => `${a.ad}: ${a.deger}`)
    .slice(0, 12);
}

export async function analizKaydet(a: AnalizKaydi): Promise<void> {
  if (!firebaseHazir || !db) return;
  try {
    const temiz = {
      domain: a.domain,
      risk: Math.round(a.risk) || 0,
      seviye: a.seviye || "",
      bulgular: (a.bulgular || []).slice(0, 8),
      ekranGoruntusu: a.ekranGoruntusu || "",
      baslik: (a.baslik || "").slice(0, 200),
      kaynak: a.kaynak || "sorgu",
      zaman: a.zaman || Date.now(),
      alanlar: (a.alanlar || []).slice(0, 30),
      kategoriler: (a.kategoriler || []).map((k) => ({ ad: k.ad, seviye: k.seviye })),
      dedektifTur: a.dedektifTur || "",
      dedektifGuven: a.dedektifGuven || "",
      deliller: (a.deliller && a.deliller.length ? a.deliller : delilCikar(a.alanlar)).slice(0, 12),
    };
    await setDoc(doc(db, "analizler", belgeId("dom", a.domain)), { ...temiz, olusturma: serverTimestamp() }, { merge: true });
  } catch {
    /* kurallar yoksa sessiz geç — analiz yine döner, sadece saklanmaz */
  }
}

// ── RİSK YÖRÜNGESİ ── domainin risk+aşama gelişimini zaman içinde kaydeder.
// Yalnız ANLAMLI değişimde nokta ekler (aşama arttı / risk ±5 / >1sa geçti) → gürültüsüz.
export type GecmisNokta = { t: number; risk: number; asama: number };
export async function riskGecmisiEkle(domain: string, risk: number, asama: number, dnaImza?: string, takipId?: string): Promise<void> {
  if (!firebaseHazir || !db) return;
  try {
    const ref = doc(db, "analizler", belgeId("dom", domain));
    const snap = await getDoc(ref);
    const son0 = snap.exists() ? (snap.data() as { takipId?: string }).takipId : undefined;
    const g: GecmisNokta[] = snap.exists() && Array.isArray((snap.data() as { gecmis?: GecmisNokta[] }).gecmis)
      ? (snap.data() as { gecmis: GecmisNokta[] }).gecmis : [];
    const son = g[g.length - 1];
    // Yörünge noktası yalnız anlamlı değişimde eklenir; ama takip kimliği YENİ görüldüyse
    // (önce yoktu) her hâlde yaz → atıf pivotu kaçmasın.
    if (!son || son.asama !== asama || Math.abs(son.risk - risk) >= 5 || Date.now() - son.t > 3600_000 || (takipId && takipId !== son0)) {
      if (!son || son.asama !== asama || Math.abs(son.risk - risk) >= 5 || Date.now() - son.t > 3600_000)
        g.push({ t: Date.now(), risk: Math.round(risk) || 0, asama });
      // domain+risk yaz → analizler kuralı (domain string + risk number) yeni belgede de geçsin.
      const veri: Record<string, unknown> = { domain, risk: Math.round(risk) || 0, gecmis: g.slice(-50), sonAsama: asama, zaman: Date.now() };
      if (dnaImza) veri.dnaImza = dnaImza; // altyapı DNA imzası → kampanya kümeleme
      if (takipId) veri.takipId = takipId; // analytics/reklam hesap kimliği → operatör pivotu
      await setDoc(ref, veri, { merge: true });
    }
  } catch { /* kurallar yoksa sessiz */ }
}

// Aynı altyapı DNA imzasını taşıyan diğer domainler (kampanya kümesi). Rules canlıysa çalışır.
export async function dnaEslesenler(imza: string, haricDomain: string): Promise<string[]> {
  if (!firebaseHazir || !db || !imza) return [];
  try {
    const snap = await getDocs(query(collection(db, "analizler"), where("dnaImza", "==", imza), fbLimit(12)));
    return snap.docs.map((d) => (d.data() as { domain?: string }).domain || "").filter((x) => x && x !== haricDomain);
  } catch { return []; }
}

// Aynı takip kimliğini (GA/GTM/AdSense/Pixel) taşıyan diğer domainler. Altyapı (IP/NS)
// tamamen farklı olsa bile aynı ölçümleme hesabı = neredeyse kesin AYNI operatör.
// En güçlü tekil atıf pivotu; dnaEslesenler'den bağımsız çalışır.
export async function takipEslesenler(takipId: string, haricDomain: string): Promise<string[]> {
  if (!firebaseHazir || !db || !takipId) return [];
  try {
    const snap = await getDocs(query(collection(db, "analizler"), where("takipId", "==", takipId), fbLimit(20)));
    return snap.docs.map((d) => (d.data() as { domain?: string }).domain || "").filter((x) => x && x !== haricDomain);
  } catch { return []; }
}
export async function riskGecmisiGetir(domain: string): Promise<GecmisNokta[]> {
  if (!firebaseHazir || !db) return [];
  try {
    const snap = await getDoc(doc(db, "analizler", belgeId("dom", domain)));
    return snap.exists() && Array.isArray((snap.data() as { gecmis?: GecmisNokta[] }).gecmis)
      ? (snap.data() as { gecmis: GecmisNokta[] }).gecmis : [];
  } catch { return []; }
}

// ── GEÇİŞ / YÜKSELME OLAYI ── bir aday bir önceki taramaya göre EYLEME geçtiğinde
// (park→canlı, yayına girdi, kimlik-avına dönüştü, risk sıçradı) bunu ayrı bir olay
// olarak işaretler. "Doğmadan izle, eyleme geçtiği an ayrıca tespit et" tezinin
// somut çıktısı: müşteri paneline düşen alarm akışı. Mevcut marka_adaylari belgesine
// yazılır → yeni koleksiyon/rule gerekmez, durum da tazelenir.
export type Yukselme = { t: number; sebep: string[]; oncekiRisk: number; simdikiRisk: number; oncekiDurum?: string; simdikiDurum?: string };
export async function adayDurumGuncelle(domain: string, durum: string, skor: number, yukselme?: Yukselme, cikisAni?: number): Promise<void> {
  if (!firebaseHazir || !db) return;
  try {
    const veri: Record<string, unknown> = { durum, skor: Math.round(skor) || 0, sonTarama: Date.now() };
    if (yukselme) veri.sonYukselme = yukselme;
    if (typeof cikisAni === "number" && cikisAni > 0) veri.cikisAni = cikisAni; // doğuş anı (sabit)
    await setDoc(doc(db, "marka_adaylari", belgeId("dom", domain)), veri, { merge: true });
  } catch { /* kurallar yoksa sessiz */ }
}
// Bir markanın son yükselmeleri (eyleme geçen adaylar) — panel alarm akışı, en yeni önce.
export async function yukselmelerGetir(marka: string, n = 20): Promise<(MarkaAday & { sonYukselme: Yukselme })[]> {
  if (!firebaseHazir || !db || !marka) return [];
  try {
    const snap = await getDocs(query(collection(db, "marka_adaylari"), where("marka", "==", marka), fbLimit(300)));
    const list = snap.docs
      .map((d) => d.data() as MarkaAday & { sonYukselme?: Yukselme })
      .filter((a): a is MarkaAday & { sonYukselme: Yukselme } => Boolean(a.sonYukselme));
    return list.sort((a, b) => b.sonYukselme.t - a.sonYukselme.t).slice(0, n);
  } catch { return []; }
}

export async function analizlerGetir(n = 100): Promise<AnalizKaydi[]> {
  if (!firebaseHazir || !db) return [];
  try {
    const snap = await getDocs(query(collection(db, "analizler"), orderBy("zaman", "desc"), fbLimit(n)));
    return snap.docs.map((d) => d.data() as AnalizKaydi);
  } catch {
    return [];
  }
}

// Belirli domainlerin analiz kayıtlarını TOPLU getirir (dashboard ortak-nokta/ülke
// için: IP/ASN/CA/ülke analizler.alanlar'da saklı). Paralel getDoc — analizler'de
// marka alanı olmadığından domain-id ile çekeriz. takipId de dahil döner.
export type AnalizIntel = { domain: string; alanlar?: { ad: string; deger: string }[]; takipId?: string; gecmis?: GecmisNokta[]; sonAsama?: number };
export async function analizlerTopluGetir(domains: string[]): Promise<Record<string, AnalizIntel>> {
  if (!firebaseHazir || !db || !domains.length) return {};
  const out: Record<string, AnalizIntel> = {};
  await Promise.all(domains.slice(0, 250).map(async (dom) => {
    try {
      const s = await getDoc(doc(db!, "analizler", belgeId("dom", dom)));
      if (s.exists()) out[dom] = s.data() as AnalizIntel;
    } catch { /* tek belge başarısız → diğerleri sürsün */ }
  }));
  return out;
}

// ── Kullanıcı markaları (self-servis kayıt: marka + RESMÎ domainler) ────────
// Kullanıcı kendi markasını + resmi site linklerini kaydeder. Resmi domainler
// ALLOWLIST olur: markanın kendi siteleri asla "sahte/aday" işaretlenmez.
export type KullaniciMarka = { anahtar: string; ad: string; resmi: string[]; zaman: number; onay: boolean };

export async function markaKayitEt(m: KullaniciMarka, email?: string): Promise<void> {
  if (!firebaseHazir || !db) return;
  try {
    await setDoc(doc(db, "kullanici_markalari", belgeId("mk", m.anahtar)), { ...m, olusturma: serverTimestamp() }, { merge: true });
    if (email) await addDoc(collection(db, "abone_iletisim"), { marka: m.anahtar, email, olusturma: serverTimestamp() });
  } catch {
    throw new Error("kaydedilemedi");
  }
}

export async function kullaniciMarkalariGetir(): Promise<KullaniciMarka[]> {
  if (!firebaseHazir || !db) return [];
  try {
    const snap = await getDocs(collection(db, "kullanici_markalari"));
    return snap.docs.map((d) => d.data() as KullaniciMarka).filter((m) => m.onay !== false);
  } catch {
    return [];
  }
}

// ── Marka Koruma (B2B) — abonelik + günlük rapor ───────────────────────────
// GİZLİLİK: abone e-postası HERKESE-AÇIK "aboneler" koleksiyonunda TUTULMAZ.
// Marka aboneliği (marka adı) aboneler'de; e-posta ayrı create-only "abone_iletisim"de.
export type Abone = { marka: string; markaAdi: string; kayitZaman: number };

export async function aboneKaydet(a: Abone, email: string): Promise<void> {
  if (!firebaseHazir || !db) return;
  try {
    await setDoc(doc(db, "aboneler", belgeId("marka", a.marka)), { ...a, olusturma: serverTimestamp() }, { merge: true });
    // E-posta sadece yazılabilir (okuma kapalı) — ileride Admin SDK ile teslimat.
    if (email) await addDoc(collection(db, "abone_iletisim"), { marka: a.marka, email, olusturma: serverTimestamp() });
  } catch {
    throw new Error("kaydedilemedi");
  }
}
export async function abonelerGetir(): Promise<Abone[]> {
  if (!firebaseHazir || !db) return [];
  try {
    const snap = await getDocs(collection(db, "aboneler"));
    return snap.docs.map((d) => d.data() as Abone);
  } catch {
    return [];
  }
}
export async function aboneGetir(marka: string): Promise<Abone | null> {
  if (!firebaseHazir || !db) return null;
  try {
    const s = await getDoc(doc(db, "aboneler", belgeId("marka", marka)));
    return s.exists() ? (s.data() as Abone) : null;
  } catch {
    return null;
  }
}

// Günlük per-marka sayaç (eşleşme + kaydedilen) — rapordaki gerçek sayılar için.
export async function markaGunlukArtir(marka: string, tarih: string, kaydedildi: boolean): Promise<void> {
  if (!firebaseHazir || !db) return;
  try {
    await setDoc(
      doc(db, "gunluk_marka_stat", `${belgeId("m", marka)}_${tarih}`),
      { marka, tarih, eslesme: increment(1), kaydedilen: increment(kaydedildi ? 1 : 0), guncelleme: serverTimestamp() },
      { merge: true }
    );
  } catch {
    /* sessiz */
  }
}
export async function markaGunlukGetir(marka: string, tarih: string): Promise<{ eslesme: number; kaydedilen: number }> {
  if (!firebaseHazir || !db) return { eslesme: 0, kaydedilen: 0 };
  try {
    const s = await getDoc(doc(db, "gunluk_marka_stat", `${belgeId("m", marka)}_${tarih}`));
    const d = s.exists() ? s.data() : {};
    return { eslesme: Number(d.eslesme || 0), kaydedilen: Number(d.kaydedilen || 0) };
  } catch {
    return { eslesme: 0, kaydedilen: 0 };
  }
}

export type GunlukRapor = {
  marka: string; markaAdi: string; tarih: string;
  eslesme: number; analiz: number;
  yuksek: MarkaAday[]; orta: MarkaAday[];
  temiz: boolean; zaman: number;
};
export async function raporKaydet(r: GunlukRapor): Promise<void> {
  if (!firebaseHazir || !db) return;
  try {
    await setDoc(doc(db, "raporlar", `${belgeId("m", r.marka)}_${r.tarih}`), { ...r, olusturma: serverTimestamp() }, { merge: true });
  } catch {
    /* sessiz */
  }
}
export async function raporSonGetir(marka: string): Promise<GunlukRapor | null> {
  if (!firebaseHazir || !db) return null;
  try {
    const snap = await getDocs(query(collection(db, "raporlar"), orderBy("zaman", "desc"), fbLimit(40)));
    return snap.docs.map((d) => d.data() as GunlukRapor).find((x) => x.marka === marka) || null;
  } catch {
    return null;
  }
}

// ── E-posta sızıntı izleme aboneliği (periyodik rapor) ─────────────────────
// GİZLİLİK: e-posta ŞİFRELİ (emailEnc) saklanır; belge id = e-posta hash'i.
export type EpostaIzleme = { id: string; emailEnc: string; periyot: string; sonBildirim: number; sonSizinti: number };

export async function epostaIzlemeKaydet(id: string, emailEnc: string, periyot: string): Promise<void> {
  if (!firebaseHazir || !db) throw new Error("firebase yok");
  // merge:true → tekrar abone olursa periyodu günceller, sonSizinti/sonBildirim korunur.
  await setDoc(doc(db, "izleme_eposta", id), { id, emailEnc, periyot, guncelleme: serverTimestamp() }, { merge: true });
}
export async function epostaIzlemeSil(id: string): Promise<void> {
  if (!firebaseHazir || !db) return;
  try { await setDoc(doc(db, "izleme_eposta", id), { pasif: true }, { merge: true }); } catch { /* */ }
}
export async function epostaIzlemelerGetir(): Promise<EpostaIzleme[]> {
  if (!firebaseHazir || !db) return [];
  try {
    const snap = await getDocs(collection(db, "izleme_eposta"));
    return snap.docs.map((d) => d.data() as EpostaIzleme & { pasif?: boolean }).filter((x) => !x.pasif && x.emailEnc);
  } catch {
    return [];
  }
}
export async function epostaIzlemeGuncelle(id: string, sonBildirim: number, sonSizinti: number): Promise<void> {
  if (!firebaseHazir || !db) return;
  try { await setDoc(doc(db, "izleme_eposta", id), { sonBildirim, sonSizinti }, { merge: true }); } catch { /* */ }
}

export async function baglantilariGetir(
  deger: string,
  tip: string
): Promise<{ deger: string; tip: string; sayi: number }[]> {
  if (!firebaseHazir || !db) return [];
  const snap = await getDoc(doc(db, "gostergeler", belgeId(tip, deger)));
  if (!snap.exists()) return [];
  const bagli = (snap.data().bagli as Record<string, { deger: string; tip: string; sayi: number }>) || {};
  return Object.values(bagli)
    .filter((v) => v && v.deger)
    .sort((a, b) => (b.sayi || 0) - (a.sayi || 0))
    .slice(0, 4);
}
