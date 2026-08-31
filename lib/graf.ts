// Gerçek kimlik/altyapı grafiği — düğüm + kenar yapısı.
// Maltego'nun yaptığı korelasyonu KENDİ motorumuzda yapıyoruz (aracı yok).
//
// SINIR: Bu graf, halka açık uygulamada bir KİŞİYİ deşifre etmez. Düğümler
// yalnızca ENTİTE/ALTYAPI ve bunların İLİŞKİLERİdir (hesap↔hesap, hesap→domain
// →IP→ASN→sertifika, birlikte-bildirilen göstergeler). Kişisel tanımlayıcılar
// (isim/e-posta/telefon) sağlayıcılardan gelse bile grafiğe alınmaz.

export type DugumTur = "account" | "domain" | "ip" | "asn" | "cert" | "ioc";

export type GrafDugum = {
  id: string;
  tur: DugumTur;
  etiket: string;
  alt?: string; // ikincil bilgi (ör. platform, ülke)
  url?: string;
  risk?: number; // 0-100, biliniyorsa
  kok?: boolean; // grafın kökü (sorgulanan hesap)
};

export type GrafKenar = {
  kaynak: string;
  hedef: string;
  etiket: string; // "website" | "resolves" | "asn" | "cert" | "linked" | "co-reported" | "ioc"
};

export type Graf = { dugumler: GrafDugum[]; kenarlar: GrafKenar[] };

// Düğüm/kenar biriktirici — id çakışmalarını tekilleştirir (DEDUPLICATION düğümü).
export class GrafKurucu {
  private d = new Map<string, GrafDugum>();
  private k: GrafKenar[] = [];

  dugum(g: GrafDugum): string {
    const varOlan = this.d.get(g.id);
    if (varOlan) {
      // Zenginleşen alanları koru (örn. sonradan risk/alt gelirse)
      if (g.risk != null && varOlan.risk == null) varOlan.risk = g.risk;
      if (g.alt && !varOlan.alt) varOlan.alt = g.alt;
      if (g.url && !varOlan.url) varOlan.url = g.url;
      return g.id;
    }
    this.d.set(g.id, { ...g });
    return g.id;
  }

  kenar(kaynak: string, hedef: string, etiket: string) {
    if (!kaynak || !hedef || kaynak === hedef) return;
    if (this.k.some((e) => e.kaynak === kaynak && e.hedef === hedef && e.etiket === etiket)) return;
    this.k.push({ kaynak, hedef, etiket });
  }

  sonuc(): Graf {
    return { dugumler: [...this.d.values()], kenarlar: this.k };
  }

  get bos(): boolean {
    return this.d.size <= 1;
  }
}

// Alan listesinden (OsintRapor.alanlar) belirli bir alanı bul.
export function alanBul(alanlar: { ad: string; deger: string }[], ...adlar: string[]): string | null {
  for (const a of alanlar) {
    const ad = a.ad.toLowerCase();
    if (adlar.some((x) => ad.includes(x))) return a.deger;
  }
  return null;
}
