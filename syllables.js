// Palavras do Monta Palavra, separadas em sílabas com hífen. Para mudar, edite esta lista:
// em minúsculas, com acento, sílabas separadas por "-". O teste (npm test) confere o formato.
module.exports = [
  'ca-va-lo', 'ba-na-na', 'bo-ne-ca', 'ja-ne-la', 'sa-pa-to', 'ca-mi-sa', 'ma-ca-co', 'to-ma-te',
  'pe-te-ca', 'ca-ne-ta', 'ca-der-no', 'es-co-la', 'la-ran-ja', 'mo-ran-go', 'ce-nou-ra', 'tar-ta-ru-ga',
  'bor-bo-le-ta', 'cho-co-la-te', 'e-le-fan-te', 'bi-ci-cle-ta', 'gi-ras-sol', 'mon-ta-nha', 'pi-po-ca',
  'sor-ve-te', 'fo-gue-te', 'pa-lha-ço', 'a-bra-ço', 'co-ra-ção', 'a-vi-ão', 'ca-mi-nhão', 'fei-jão',
  'li-mão', 'me-lão', 'bo-né', 'ca-fé', 'so-fá', 'pi-co-lé', 'sa-bi-á', 'ma-ra-cu-já', 'ja-ca-ré',
  'mú-si-ca', 'ár-vo-re', 'pás-sa-ro', 'lâm-pa-da', 'xí-ca-ra', 'ô-ni-bus', 'lá-pis', 'a-pon-ta-dor',
  'es-to-jo', 'me-ren-da', 'co-ru-ja', 'for-mi-ga', 'gi-ra-fa', 'di-nos-sau-ro', 'as-tro-nau-ta',
  'pla-ne-ta', 'te-cla-do', 'com-pu-ta-dor', 'ja-bu-ti-ca-ba', 'pa-ço-ca', 'ca-be-ça', 'on-ça',
  'pi-ja-ma', 'ma-ca-xei-ra', 'ca-po-ei-ra', 'tu-ba-rão', 'va-ca', 'ga-li-nha', 'co-e-lho', 'sa-po',
].map((w) => w.normalize('NFC'));
