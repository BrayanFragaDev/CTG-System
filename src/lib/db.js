import { useEffect, useState } from 'react';
import {
  collection, doc, query, onSnapshot, serverTimestamp, writeBatch, getDocs,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { fmtMoeda } from './format';

export const colRef = (ent, nome) => collection(db, 'entidades', ent, nome);
export const docRef = (ent, nome, id) => doc(db, 'entidades', ent, nome, id);

// Carimbo de autoria: as regras do Firestore recusam qualquer gravação
// em que o uid não seja o de quem está logado ou a data não seja a do servidor.
const carimbo = () => ({
  atualizadoEm: serverTimestamp(),
  atualizadoPor: auth.currentUser?.email || null,
  atualizadoPorUid: auth.currentUser?.uid || null,
});

const NOMES = {
  socios: 'sócio', mensalidades: 'mensalidade', contas: 'conta', caixa: 'lançamento de caixa', eventos: 'evento',
  invernadas: 'invernada', patrimonio: 'item de patrimônio', avisos: 'aviso',
};

export function resumoDe(nome, d = {}) {
  const titulo = d.nome || d.descricao || d.titulo || d.socioNome || '';
  const extra = d.competencia ? ` ${d.competencia}` : '';
  const valor = typeof d.valor === 'number' ? ` (${fmtMoeda(d.valorPago ?? d.valor)})` : '';
  return `${NOMES[nome] || nome}: ${titulo}${extra}${valor}`.trim();
}

// Registro de atividades. Exclusões usam um id fixo (del_<coleção>_<id>) que
// as regras exigem no mesmo lote: não dá para apagar nada sem deixar rastro.
function registrar(b, ent, acao, colecao, docId, resumo, idFixo) {
  const ref = idFixo ? doc(db, 'entidades', ent, 'auditoria', idFixo) : doc(colRef(ent, 'auditoria'));
  b.set(ref, {
    acao, colecao: colecao || null, docId: docId || null, resumo: String(resumo || '').slice(0, 300),
    uid: auth.currentUser?.uid || null, email: auth.currentUser?.email || null, em: serverTimestamp(),
  });
}

const limpar = (dados) => Object.fromEntries(Object.entries(dados).filter(([k, v]) => k !== 'id' && v !== undefined));

export async function salvar(ent, nome, id, dados, resumo) {
  const b = writeBatch(db);
  const limpo = limpar(dados);
  let ref;
  if (id) {
    ref = docRef(ent, nome, id);
    b.update(ref, { ...limpo, ...carimbo() });
  } else {
    ref = doc(colRef(ent, nome));
    b.set(ref, { ...limpo, ...carimbo(), criadoEm: serverTimestamp() });
  }
  registrar(b, ent, id ? 'alterou' : 'criou', nome, ref.id, resumo || resumoDe(nome, limpo));
  await b.commit();
  return ref.id;
}

export async function excluir(ent, nome, id, resumo) {
  const b = writeBatch(db);
  registrar(b, ent, 'excluiu', nome, id, resumo || `${NOMES[nome] || nome} ${id}`, `del_${nome}_${id}`);
  b.delete(docRef(ent, nome, id));
  await b.commit();
}

// Registro avulso (ex.: exportação de dados pessoais)
export async function registrarAtividade(ent, acao, resumo) {
  const b = writeBatch(db);
  registrar(b, ent, acao, null, null, resumo);
  await b.commit();
}

export function novoLote() {
  const b = writeBatch(db);
  let ent0 = null;
  return {
    criar(ent, nome, dados) {
      ent0 = ent;
      const r = doc(colRef(ent, nome));
      b.set(r, { ...dados, ...carimbo(), criadoEm: serverTimestamp() });
      return r.id;
    },
    atualizar(ent, nome, id, dados) { ent0 = ent; b.update(docRef(ent, nome, id), { ...dados, ...carimbo() }); },
    excluir(ent, nome, id, resumo) {
      ent0 = ent;
      registrar(b, ent, 'excluiu', nome, id, resumo || `${NOMES[nome] || nome} ${id}`, `del_${nome}_${id}`);
      b.delete(docRef(ent, nome, id));
    },
    registrar(acao, resumo, ent = ent0) { registrar(b, ent, acao, null, null, resumo); },
    commit: () => b.commit(),
  };
}

// Firestore aceita até 500 operações por lote; divide em vários quando precisa.
// `resumo` registra UMA linha de atividade por lote (em vez de uma por documento).
export async function emLotes(itens, fn, tamanho = 400, ent = null, resumo = null) {
  for (let i = 0; i < itens.length; i += tamanho) {
    const lote = novoLote();
    const parte = itens.slice(i, i + tamanho);
    parte.forEach((it) => fn(lote, it));
    if (resumo) lote.registrar('criou em lote', `${resumo} (${parte.length})`, ent);
    await lote.commit();
  }
}

export async function buscar(ent, nome, ...restricoes) {
  const s = await getDocs(query(colRef(ent, nome), ...restricoes));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Escuta uma coleção da entidade em tempo real.
// `chave` deve mudar quando as restrições mudarem (ex.: período filtrado).
export function useColecao(ent, nome, restricoes = [], chave = '') {
  const [estado, setEstado] = useState({ dados: [], carregando: true, erro: null });
  useEffect(() => {
    if (!ent || restricoes === null) { setEstado({ dados: [], carregando: false, erro: null }); return undefined; }
    setEstado((e) => ({ ...e, carregando: true }));
    const q = query(colRef(ent, nome), ...restricoes);
    return onSnapshot(
      q,
      (s) => setEstado({ dados: s.docs.map((d) => ({ id: d.id, ...d.data() })), carregando: false, erro: null }),
      (erro) => { console.error(nome, erro); setEstado({ dados: [], carregando: false, erro }); },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ent, nome, chave, restricoes === null]);
  return estado;
}
