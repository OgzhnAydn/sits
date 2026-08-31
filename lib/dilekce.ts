type DilekceGirdi = {
  kategori: string;
  kategoriAdi: string;
  ozet: string;
  gostergeler: { url: string[]; iban: string[]; telefon: string[] };
  referansNo: string;
};

const KURUM: Record<string, { kurum: string; talep: string }> = {
  dolandiricilik: {
    kurum: "İLGİLİ BANKA GENEL MÜDÜRLÜĞÜNE ve CUMHURİYET BAŞSAVCILIĞINA",
    talep:
      "dolandırıcıya ait banka hesabının bloke edilmesini ve şüpheliler hakkında gerekli soruşturmanın başlatılmasını",
  },
  sahte_hesap: {
    kurum: "CUMHURİYET BAŞSAVCILIĞINA",
    talep:
      "adıma açılan sahte hesabın kapatılması ve sorumlular hakkında yasal işlem yapılmasını",
  },
  tehdit: {
    kurum: "CUMHURİYET BAŞSAVCILIĞINA",
    talep:
      "hakkımda tehdit/şantajda bulunan şüpheliler hakkında gerekli soruşturmanın başlatılmasını",
  },
  hakaret: {
    kurum: "CUMHURİYET BAŞSAVCILIĞINA",
    talep:
      "hakkımda hakaret/iftirada bulunan kişi hakkında yasal işlem yapılmasını",
  },
  yasa_disi: {
    kurum: "BİLGİ TEKNOLOJİLERİ VE İLETİŞİM KURUMUNA (BTK)",
    talep:
      "söz konusu yasa dışı içeriğe erişimin engellenmesini ve gerekli işlemlerin yapılmasını",
  },
  diger: {
    kurum: "CUMHURİYET BAŞSAVCILIĞINA",
    talep: "söz konusu olayla ilgili gerekli işlemlerin yapılmasını",
  },
};

export function dilekceUret(g: DilekceGirdi, tarih: string): { kurum: string; metin: string } {
  const k = KURUM[g.kategori] || KURUM.diger;
  const bilgiler: string[] = [];
  g.gostergeler.iban.forEach((v) => bilgiler.push(`- Dolandırıcıya ait IBAN : ${v}`));
  g.gostergeler.telefon.forEach((v) => bilgiler.push(`- İrtibat telefonu       : ${v}`));
  g.gostergeler.url.forEach((v) => bilgiler.push(`- İlgili web sitesi       : ${v}`));

  const metin = `${tarih}

${k.kurum}

KONU : Siber suç/dolandırıcılık şikayeti (${g.kategoriAdi}).

ŞİKAYET EDEN : [Ad Soyad]
T.C. KİMLİK NO: [T.C. Kimlik Numaranız]
İLETİŞİM      : [Telefon / E-posta]

AÇIKLAMALAR :
${g.ozet}

Olaya ilişkin tarafımca tespit edilen bilgiler aşağıdadır:
${bilgiler.join("\n") || "- (Ek gösterge bulunmamaktadır.)"}

TALEP :
Yukarıda arz ve izah ettiğim üzere mağduru olduğum bu olayla ilgili ${k.talep} saygılarımla arz ederim.

${tarih}
[Ad Soyad]
[İmza]

------------------------------------------------------------
Not: Bu dilekçe SİTS ile hazırlanmıştır (Referans: ${g.referansNo}).
İhbarınızı ayrıca https://ihbarweb.org.tr üzerinden de yapabilirsiniz.
Acil durumlarda 155 (Polis) aranmalıdır.`;

  return { kurum: k.kurum, metin };
}
