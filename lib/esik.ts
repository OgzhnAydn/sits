// Bir gösterge "doğrulandı" (kesin dolandırıcı) sayılması için gereken
// FARKLI bildiren sayısı. Altında "az bildirim — henüz doğrulanmadı" denir.
// Bu, tek bir kötü niyetli bildirimin masum birini kara listeye düşürmesini önler.
export const ESIK = 3;

// Topluluk bildirimi GÖSTERİLMESİ (ve risk eklenmesi) için gereken asgari farklı
// bildiren sayısı. Tek bir bildirim (benzersiz=1) iftira/gürültü olabilir → hiç
// gösterilmez, risk eklenmez. 2+ olunca "doğrulanmadı" etiketiyle görünür,
// ESIK+ olunca "doğrulandı" sayılır.
export const GOSTER_ESIK = 2;
