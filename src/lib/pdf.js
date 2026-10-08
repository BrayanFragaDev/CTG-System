// A biblioteca de PDF é pesada: só é baixada quando alguém gera um documento.
const carregar = () => import('./pdfImpl');

export const relatorioPdf = (...a) => carregar().then((m) => m.relatorioPdf(...a));
export const reciboPdf = (...a) => carregar().then((m) => m.reciboPdf(...a));
export const reciboMensalidades = (...a) => carregar().then((m) => m.reciboMensalidades(...a));
export const fichaSocioPdf = (...a) => carregar().then((m) => m.fichaSocioPdf(...a));
