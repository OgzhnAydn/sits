// E-posta gönderimi (Resend — ücretsiz katman). RESEND_API_KEY yoksa kapalı;
// abonelik kaydedilir ama teslimat, anahtar eklenince başlar.
// MAIL_FROM: doğrulanmış gönderen (yoksa Resend'in test adresi kullanılır).

export const mailVar = () => Boolean(process.env.RESEND_API_KEY);

export async function mailGonder(alici: string, konu: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const from = process.env.MAIL_FROM || "SİTS Nazar <onboarding@resend.dev>";
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: alici, subject: konu, html }),
      signal: AbortSignal.timeout(10000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

// Basit, marka tutarlı e-posta şablonu (lacivert başlık + içerik).
export function mailSablon(baslik: string, govde: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f6ff;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1a2340">
    <div style="max-width:520px;margin:0 auto;padding:24px">
      <div style="background:#0e3a6e;color:#fff;border-radius:18px 18px 0 0;padding:18px 22px">
        <div style="font-size:20px;font-weight:800">SİTS · Nazar</div>
        <div style="font-size:13px;opacity:.85">${baslik}</div>
      </div>
      <div style="background:#fff;border-radius:0 0 18px 18px;padding:22px;font-size:14px;line-height:1.6">
        ${govde}
      </div>
      <p style="font-size:11px;color:#8a93ad;text-align:center;margin-top:14px">
        Bu raporu izleme aboneliğin için aldın. Resmi bir devlet uygulaması değildir.
      </p>
    </div></body></html>`;
}
