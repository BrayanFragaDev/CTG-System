import { doc, writeBatch, serverTimestamp, increment } from 'firebase/firestore';
import { db, auth } from './firebase';
import { colRef, docRef } from './db';
import { arred, fmtMoeda, fmtData } from './format';

// Copa e estoque.
//
// Como funciona a copa de um evento:
//  1. ABRIR: conta-se tudo que há na copa e no depósito. Se a contagem diferir do
//     que o sistema esperava, a diferença vira um "ajuste" registrado.
//  2. Durante o evento: anota-se a reposição (o que chegou depois da abertura).
//  3. FECHAR: conta-se o que sobrou e a cortesia/perda. Vendido = início + reposição
//     − fim − cortesia. O sistema calcula quanto deveria ter entrado e compara com
//     o que o responsável informa (dinheiro, PIX, cartão).
//  4. CONFERIR: o tesoureiro confere e lança no caixa. Quem vende não é quem lança.

const carimbo = () => ({
  atualizadoEm: serverTimestamp(), atualizadoPor: auth.currentUser?.email || null, atualizadoPorUid: auth.currentUser?.uid || null,
});
const novoId = (ent, nome) => doc(colRef(ent, nome));

function log(b, ent, acao, colecao, docId, resumo, idFixo) {
  const ref = idFixo ? doc(db, 'entidades', ent, 'auditoria', idFixo) : novoId(ent, 'auditoria');
  b.set(ref, {
    acao, colecao, docId: docId || null, resumo: String(resumo).slice(0, 300),
    uid: auth.currentUser?.uid || null, email: auth.currentUser?.email || null, em: serverTimestamp(),
  });
}

function movimento(b, ent, dados) {
  b.set(novoId(ent, 'movEstoque'), { ...dados, ...carimbo(), criadoEm: serverTimestamp() });
}

export const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? 0 : Number(v));

export function calcularItem(i) {
  const vendido = num(i.inicio) + num(i.reposicao) - num(i.fim) - num(i.cortesia);
  // custoTotal (do que foi vendido) não pode sobrescrever i.custo (custo unitário)
  return { vendido, valor: arred(vendido * num(i.preco)), custoTotal: arred(vendido * num(i.custo)) };
}

export function resumoSessao(itens, recebido = {}) {
  const linhas = itens.map((i) => ({ ...i, ...calcularItem(i) }));
  const esperado = arred(linhas.reduce((s, l) => s + l.valor, 0));
  const custo = arred(linhas.reduce((s, l) => s + l.custoTotal, 0));
  const totalRecebido = arred(num(recebido.dinheiro) + num(recebido.pix) + num(recebido.cartao));
  return { linhas, esperado, custo, totalRecebido, diferenca: arred(totalRecebido - esperado), lucro: arred(totalRecebido - custo) };
}

// ---------- Abrir ----------
export async function abrirCopa(ent, { data, evento, responsavel, itens }) {
  const b = writeBatch(db);
  const ref = novoId(ent, 'copa');
  itens.forEach((i) => {
    const dif = num(i.inicio) - num(i.sistema);
    if (dif !== 0) {
      movimento(b, ent, {
        tipo: 'ajuste', produtoId: i.produtoId, produtoNome: i.nome, quantidade: dif, data,
        motivo: 'Contagem na abertura da copa', sessaoId: ref.id, eventoId: evento?.id || null,
      });
      b.update(docRef(ent, 'produtos', i.produtoId), { estoque: num(i.inicio), ...carimbo() });
    }
  });
  b.set(ref, {
    data, eventoId: evento?.id || null, eventoNome: evento?.nome || null, responsavel: responsavel || '',
    status: 'aberta', itens: itens.map((i) => ({ ...i, inicio: num(i.inicio), reposicao: 0, fim: null, cortesia: 0 })),
    abertaPor: auth.currentUser?.email || null, ...carimbo(), criadoEm: serverTimestamp(),
  });
  log(b, ent, 'abriu a copa', 'copa', ref.id, `${evento?.nome || fmtData(data)} — ${itens.length} produtos contados`);
  await b.commit();
  return ref.id;
}

// ---------- Fechar ----------
export async function fecharCopa(ent, sessao, itens, recebido, obs) {
  const r = resumoSessao(itens, recebido);
  const b = writeBatch(db);
  r.linhas.forEach((l) => {
    const base = { produtoId: l.produtoId, produtoNome: l.nome, data: sessao.data, sessaoId: sessao.id, eventoId: sessao.eventoId || null };
    if (l.vendido !== 0) movimento(b, ent, { ...base, tipo: 'venda', quantidade: l.vendido, valorUnit: num(l.preco), custoUnit: num(l.custo) });
    if (num(l.cortesia) > 0) movimento(b, ent, { ...base, tipo: 'consumo', quantidade: num(l.cortesia), custoUnit: num(l.custo), motivo: 'Cortesia / perda na copa' });
    b.update(docRef(ent, 'produtos', l.produtoId), { estoque: num(l.fim), ...carimbo() });
  });
  b.update(docRef(ent, 'copa', sessao.id), {
    status: 'fechada',
    itens: r.linhas.map(({ vendido, valor, custoTotal, ...i }) => ({ ...i, fim: num(i.fim), cortesia: num(i.cortesia), reposicao: num(i.reposicao) })),
    recebido: { dinheiro: num(recebido.dinheiro), pix: num(recebido.pix), cartao: num(recebido.cartao) },
    esperado: r.esperado, custo: r.custo, totalRecebido: r.totalRecebido, diferenca: r.diferenca,
    obs: obs || '', fechadaPor: auth.currentUser?.email || null, fechadaEm: serverTimestamp(), ...carimbo(),
  });
  log(b, ent, 'fechou a copa', 'copa', sessao.id,
    `${sessao.eventoNome || fmtData(sessao.data)}: esperado ${fmtMoeda(r.esperado)}, recebido ${fmtMoeda(r.totalRecebido)}, diferença ${fmtMoeda(r.diferenca)}`);
  await b.commit();
  return r;
}

// ---------- Conferir (tesoureiro) ----------
const FORMAS = { dinheiro: 'Dinheiro', pix: 'PIX', cartao: 'Cartão de débito' };

export async function conferirCopa(ent, sessao, contas, categoria) {
  const b = writeBatch(db);
  const caixaIds = [];
  Object.entries(FORMAS).forEach(([chave, forma]) => {
    const valor = num(sessao.recebido?.[chave]);
    if (valor <= 0) return;
    const ref = novoId(ent, 'caixa');
    caixaIds.push(ref.id);
    b.set(ref, {
      data: sessao.data, tipo: 'entrada', valor: arred(valor), categoria,
      descricao: `Copa — ${sessao.eventoNome || fmtData(sessao.data)} (${forma})`,
      conta: contas[chave], forma, origem: 'copa', refId: sessao.id,
      eventoId: sessao.eventoId || null, eventoNome: sessao.eventoNome || null,
      ...carimbo(), criadoEm: serverTimestamp(),
    });
  });
  b.update(docRef(ent, 'copa', sessao.id), { status: 'conferida', caixaIds, conferidaPor: auth.currentUser?.email || null, conferidaEm: serverTimestamp(), ...carimbo() });
  log(b, ent, 'conferiu a copa', 'copa', sessao.id, `${sessao.eventoNome || fmtData(sessao.data)}: ${fmtMoeda(sessao.totalRecebido)} lançados no caixa`);
  await b.commit();
}

export async function estornarConferencia(ent, sessao) {
  const b = writeBatch(db);
  (sessao.caixaIds || []).forEach((id) => {
    log(b, ent, 'excluiu', 'caixa', id, `Estorno da conferência da copa ${sessao.eventoNome || fmtData(sessao.data)}`, `del_caixa_${id}`);
    b.delete(docRef(ent, 'caixa', id));
  });
  b.update(docRef(ent, 'copa', sessao.id), { status: 'fechada', caixaIds: [], ...carimbo() });
  log(b, ent, 'estornou', 'copa', sessao.id, `Conferência da copa ${sessao.eventoNome || fmtData(sessao.data)} desfeita`);
  await b.commit();
}

// ---------- Compras ----------
export async function registrarCompra(ent, { data, fornecedor, itens, pagamento, evento, categoria }) {
  const b = writeBatch(db);
  const total = arred(itens.reduce((s, i) => s + num(i.quantidade) * num(i.custo), 0));
  const grupo = `c${Date.now()}`;
  itens.forEach((i) => {
    movimento(b, ent, {
      tipo: 'compra', produtoId: i.produto.id, produtoNome: i.produto.nome, quantidade: num(i.quantidade),
      custoUnit: num(i.custo), data, fornecedor: fornecedor || '', grupo, eventoId: evento?.id || null,
    });
    b.update(docRef(ent, 'produtos', i.produto.id), { estoque: increment(num(i.quantidade)), precoCusto: num(i.custo), ...carimbo() });
  });
  const descricao = `Compra para a copa${fornecedor ? ` — ${fornecedor}` : ''} (${itens.length} item(ns))`;
  if (pagamento.modo === 'agora') {
    b.set(novoId(ent, 'caixa'), {
      data, tipo: 'saida', valor: total, categoria, descricao, conta: pagamento.conta, forma: pagamento.forma,
      origem: 'manual', eventoId: evento?.id || null, eventoNome: evento?.nome || null, ...carimbo(), criadoEm: serverTimestamp(),
    });
  } else {
    b.set(novoId(ent, 'contas'), {
      tipo: 'pagar', descricao, pessoa: fornecedor || '', categoria, valor: total, vencimento: pagamento.vencimento,
      status: 'aberto', documento: '', observacoes: '', eventoId: evento?.id || null, eventoNome: evento?.nome || null,
      ...carimbo(), criadoEm: serverTimestamp(),
    });
  }
  log(b, ent, 'comprou', 'movEstoque', grupo, `${descricao}: ${fmtMoeda(total)} (${pagamento.modo === 'agora' ? 'pago' : 'a prazo'})`);
  await b.commit();
  return total;
}

// ---------- Ajustes manuais (contagem, perda, consumo da diretoria) ----------
export async function ajustarEstoque(ent, produto, { tipo, quantidade, novaQuantidade, motivo, data }) {
  const b = writeBatch(db);
  let delta;
  if (tipo === 'ajuste') delta = num(novaQuantidade) - num(produto.estoque);
  else delta = -Math.abs(num(quantidade));
  movimento(b, ent, {
    tipo, produtoId: produto.id, produtoNome: produto.nome, quantidade: tipo === 'ajuste' ? delta : Math.abs(num(quantidade)),
    custoUnit: num(produto.precoCusto), data, motivo: motivo || '',
  });
  b.update(docRef(ent, 'produtos', produto.id), { estoque: increment(delta), ...carimbo() });
  log(b, ent, tipo === 'ajuste' ? 'ajustou estoque' : `registrou ${tipo}`, 'produtos', produto.id,
    `${produto.nome}: ${delta > 0 ? '+' : ''}${delta} ${produto.unidade || 'un'}${motivo ? ` (${motivo})` : ''}`);
  await b.commit();
}
