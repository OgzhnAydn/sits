// @react-pdf/pdfkit (react-pdf'in düşük seviyeli PDF writer fork'u) tip bildirimi taşımıyor.
// BahisListePdf.tsx bunu dinamik import edip kendi `Doc` arayüzüne cast ediyor; burada
// modülü any olarak bildirerek TS7016'yı susturuyoruz (gerçek şekli çağrı tarafında tiplenir).
declare module "@react-pdf/pdfkit";
