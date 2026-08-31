// Profil zenginleştirme — bulunan bir hesabın PUBLIC profil meta'sından
// SINIR-GÜVENLİ sinyaller çeker: beyan edilen web sitesi (→ altyapı zincirine
// bağlanır) ve hesap oluşturma tarihi (yaş). Ücretsiz, anahtarsız (GitHub için
// opsiyonel GITHUB_TOKEN sadece kotayı artırır).
//
// SINIR: isim/e-posta gibi kişisel tanımlayıcılar ALINMAZ — yalnızca ilişki
// (website → domain) ve metadata (oluşturma tarihi). PERSON kolu açılmaz.

export type ProfilBilgi = { platform: string; url: string; website?: string; olusturma?: string };

const UA = { "User-Agent": "SITS-Nazar/1.0 (OSINT self-check)", Accept: "application/json" };

function hostAyikla(u?: string): string | undefined {
  if (!u) return undefined;
  let s = u.trim().toLowerCase();
  if (!s) return undefined;
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/\s?#]/)[0];
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? s : undefined;
}

// GitHub public profili — blog(website) + created_at. İsim/e-posta KULLANILMAZ.
export async function githubProfil(kullanici: string): Promise<ProfilBilgi | null> {
  const q = kullanici.replace(/^@/, "");
  if (!/^[A-Za-z0-9-]{1,39}$/.test(q)) return null;
  const token = process.env.GITHUB_TOKEN;
  try {
    const r = await fetch(`https://api.github.com/users/${encodeURIComponent(q)}`, {
      headers: { ...UA, Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j?.login) return null;
    return {
      platform: "GitHub",
      url: `https://github.com/${j.login}`,
      website: hostAyikla(j.blog),
      olusturma: typeof j.created_at === "string" ? j.created_at.slice(0, 10) : undefined,
    };
  } catch {
    return null;
  }
}

// Reddit public profili — oluşturma tarihi (yaş). İsim/PII yok.
export async function redditProfil(kullanici: string): Promise<ProfilBilgi | null> {
  const q = kullanici.replace(/^@/, "").replace(/^u\//, "");
  if (!/^[A-Za-z0-9._-]{2,20}$/.test(q)) return null;
  try {
    const r = await fetch(`https://www.reddit.com/user/${encodeURIComponent(q)}/about.json`, {
      headers: { ...UA, "User-Agent": "SITS-Nazar/1.0 osint" },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const d = j?.data;
    if (!d?.name) return null;
    const olusturma =
      typeof d.created_utc === "number" ? new Date(d.created_utc * 1000).toISOString().slice(0, 10) : undefined;
    return { platform: "Reddit", url: `https://www.reddit.com/user/${d.name}`, olusturma };
  } catch {
    return null;
  }
}

// Bir kullanıcı adını ücretsiz kaynaklarda zenginleştir (paralel).
export async function profilZengin(kullanici: string): Promise<ProfilBilgi[]> {
  if (!kullanici) return [];
  const [gh, rd] = await Promise.all([githubProfil(kullanici), redditProfil(kullanici)]);
  return [gh, rd].filter((x): x is ProfilBilgi => Boolean(x));
}
