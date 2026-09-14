# MirLeon — ETBİS sicilini GÜNLÜK tazele + (değiştiyse) yayına al.
# Windows Görev Zamanlayıcı bunu günde bir kez çalıştırır (schtasks ile kurulur).
# Akış: tam indir (--bastan) -> beyaz-liste üret -> lib/etbisData.json değiştiyse vercel --prod.
# NOT: Günlük tam tarama ~6000 istek/~1 saat, tek IP'den. ETBİS az değişir; HAFTALIK genelde
#      yeterli ve devlet-sunucusuna daha kibar (IP engellenme riski düşer). Sıklığı değiştirmek:
#      schtasks ... /SC WEEKLY  (aşağıdaki kurulum satırında).

$ErrorActionPreference = "Stop"
$proj = "C:\Users\cc\Desktop\siber-bildir-web"
$asset = Join-Path $proj "lib\etbisData.json"
$log = Join-Path $proj "data\etbis-gunluk.log"
Set-Location $proj

function Log($m) { "$(Get-Date -Format o)  $m" | Tee-Object -FilePath $log -Append }

try {
  Log "=== ETBİS günlük tazeleme başladı ==="
  $onceHash = if (Test-Path $asset) { (Get-FileHash $asset -Algorithm SHA256).Hash } else { "" }

  node scripts/etbis-indir.mjs --bastan   *>> $log
  node scripts/etbis-beyazliste.mjs       *>> $log

  $sonraHash = if (Test-Path $asset) { (Get-FileHash $asset -Algorithm SHA256).Hash } else { "" }
  if ($sonraHash -and $sonraHash -ne $onceHash) {
    Log "Liste DEĞİŞTİ → yayına alınıyor (vercel --prod)"
    $ok = $false
    foreach ($i in 1..5) {
      $out = (vercel --prod --yes 2>&1 | Out-String)
      $out *>> $log
      if ($out -match "https://[a-z0-9-]+\.vercel\.app" -and $out -match "Production") { $ok = $true; break }
      Log "deploy denemesi $i başarısız, 10sn sonra tekrar"; Start-Sleep -Seconds 10
    }
    Log ("Deploy: " + ($(if ($ok) { "TAMAM" } else { "BAŞARISIZ (elle vercel --prod)" })))
  } else {
    Log "Liste değişmedi → deploy YOK."
  }
  Log "=== bitti ==="
} catch {
  Log "HATA: $_"
  exit 1
}
