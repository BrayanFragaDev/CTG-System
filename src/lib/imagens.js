// Brasão da entidade e foto do sócio.
//
// As imagens são reduzidas e comprimidas no navegador e guardadas no próprio
// Firestore (sem Firebase Storage, que exige o plano pago em projetos novos).
// Brasão: PNG (mantém transparência) até 320 px. Foto: JPEG quadrado 300×300.
// PNG e JPEG porque são os formatos que os PDFs (recibos, fichas) aceitam.

export const LIMITE_LOGO = 250000;   // caracteres do data URL (~180 KB)
export const LIMITE_FOTO = 120000;   // ~90 KB

function carregar(arquivo) {
  return new Promise((resolve, reject) => {
    if (!arquivo || !/^image\/(png|jpe?g|webp|gif|bmp)$/i.test(arquivo.type)) {
      reject(new Error('Escolha uma imagem PNG, JPG ou WEBP.'));
      return;
    }
    if (arquivo.size > 15 * 1024 * 1024) { reject(new Error('A imagem passa de 15 MB. Escolha um arquivo menor.')); return; }
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível abrir essa imagem.')); };
    img.src = url;
  });
}

function desenhar(img, largura, altura, recorte) {
  const c = document.createElement('canvas');
  c.width = largura; c.height = altura;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  if (recorte) {
    // recorte quadrado central (rosto costuma estar no meio/alto da foto)
    const lado = Math.min(img.width, img.height);
    const sx = (img.width - lado) / 2;
    const sy = Math.max(0, (img.height - lado) / 3);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, largura, altura);
    ctx.drawImage(img, sx, sy, lado, lado, 0, 0, largura, altura);
  } else {
    ctx.drawImage(img, 0, 0, largura, altura);
  }
  return c;
}

export async function prepararLogo(arquivo) {
  const img = await carregar(arquivo);
  for (const max of [320, 256, 200, 160]) {
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const url = desenhar(img, Math.round(img.width * k), Math.round(img.height * k)).toDataURL('image/png');
    if (url.length <= LIMITE_LOGO) return url;
  }
  // brasão muito detalhado: cai para JPEG com fundo branco
  const k = Math.min(1, 256 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}

export async function prepararFoto(arquivo) {
  const img = await carregar(arquivo);
  const c = desenhar(img, 300, 300, true);
  for (const q of [0.85, 0.75, 0.6, 0.45]) {
    const url = c.toDataURL('image/jpeg', q);
    if (url.length <= LIMITE_FOTO) return url;
  }
  return desenhar(img, 200, 200, true).toDataURL('image/jpeg', 0.6);
}

export const formatoImagem = (dataUrl) => (/^data:image\/png/.test(dataUrl || '') ? 'PNG' : 'JPEG');
