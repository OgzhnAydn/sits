import { NextRequest, NextResponse } from "next/server";
import { czdsToken, czdsLinkler, zoneTaraTek, czdsYapilandi } from "@/lib/czds";
import { markaAdayKaydet, markaGunlukArtir } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// ICANN CZDS ZONE TARAMASI — onaylı gTLD'lerin TAM namespace'ini (CT/NRD'nin kaçırdığı
// park/sertifikasız/eski domainler dahil) marka taklidi için tarar. nrd-tara motoruyla
// aynı FP süzgeci; kaynak "zone". Günlük cron. BÜYÜK zone'lar (ör. .xyz) Vercel bellek/süre
// sınırını aşar → ATLANIR (Fly worker'a bırakılır); küçük/orta onaylı TLD'ler burada işlenir.
const seviye = (s: number) => (s >= 60 ? "Yüksek" : s >= 30 ? "Orta" : "Düşük");

export async function GET(req: NextRequest) {
  const sir = process.env.CRON_SECRET;
  const verilen = (req.headers.get("authorization") || "").replace(/^Bearer /, "") || new URL(req.url).searchParams.get("secret") || "";
  if (sir && verilen !== sir) return NextResponse.json({ hata: "Yetkisiz." }, { status: 401 });

  if (!czdsYapilandi) return NextResponse.json({ hata: "CZDS yapılandırılmadı — ICANN_USER + ICANN_PASS secret'ları gerekli." }, { status: 503 });

  const token = await czdsToken();
  if (!token) return NextResponse.json({ hata: "ICANN kimlik doğrulaması başarısız (kullanıcı/parola veya hesap durumu)." }, { status: 502 });

  const linkler = await czdsLinkler(token);
  if (!linkler.length) return NextResponse.json({ ok: true, not: "Onaylı zone bulunamadı (başvurular hâlâ beklemede olabilir).", linkSayisi: 0 });

  // Tek TLD'yi test için: ?tld=zone. Boyut kapısı: ?maxmb=8 (Vercel güvenli varsayılan).
  const u = new URL(req.url);
  const tekTld = (u.searchParams.get("tld") || "").toLowerCase();
  const maxMB = Math.min(20, Math.max(1, Number(u.searchParams.get("maxmb")) || 8));
  const hedef = tekTld ? linkler.filter((l) => l.tld === tekTld) : linkler;

  const tarih = new Date().toISOString().slice(0, 10);
  const bitis = Date.now() + 270_000; // 300s limitinden önce güvenle dur
  let islenen = 0, atlanan = 0, kaydedilen = 0, kesildi = false;
  const buyukler: string[] = [];
  const ornek: { domain: string; marka: string; tld: string }[] = [];

  for (const l of hedef) {
    if (Date.now() > bitis) { kesildi = true; break; }
    const r = await zoneTaraTek(l.url, token, maxMB);
    if (r.atlandi) { atlanan++; buyukler.push(`${l.tld} (${r.boyutMB}MB)`); continue; }
    if (r.hata) continue;
    islenen++;
    for (const a of r.adaylar) {
      try {
        await markaGunlukArtir(a.marka, tarih, true);
        await markaAdayKaydet({
          domain: a.domain, marka: a.marka, markaAdi: a.markaAdi, skor: 44, seviye: seviye(44),
          sinyaller: [`CZDS zone taraması (.${l.tld}) — marka adını taşıyan, resmî olmayan kayıtlı domain; tam namespace'ten (sertifika/yeni-kayıt beklemeden) bulundu.`],
          kaynak: "zone", zaman: Date.now(),
        });
        kaydedilen++;
        if (ornek.length < 20) ornek.push({ domain: a.domain, marka: a.marka, tld: l.tld });
      } catch { /* yazma başarısızsa geç */ }
      if (Date.now() > bitis) { kesildi = true; break; }
    }
    if (kesildi) break;
  }

  return NextResponse.json(
    { ok: true, onayliZone: linkler.length, islenen, atlananBuyuk: atlanan, buyukler: buyukler.slice(0, 30), kaydedilen, kesildi, ornek },
    { headers: { "Cache-Control": "no-store" } },
  );
}
