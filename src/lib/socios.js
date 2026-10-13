import { useEffect, useState } from 'react';
import {
  collectionGroup, query, where, onSnapshot, doc, getDoc, writeBatch, serverTimestamp, deleteField,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { colRef, docRef } from './db';

// Dados pessoais sensíveis (LGPD): ficam fora do cadastro principal,
// em socios/{id}/privado/dados, que só patrão, secretário, coordenador
// artístico e o próprio sócio conseguem ler.
export const CAMPOS_PRIVADOS = ['cpf', 'rg', 'endereco', 'bairro', 'cep'];

const carimbo = () => ({
  atualizadoEm: serverTimestamp(), atualizadoPor: auth.currentUser?.email || null, atualizadoPorUid: auth.currentUser?.uid || null,
});
const privadoRef = (ent, socioId) => doc(db, 'entidades', ent, 'socios', socioId, 'privado', 'dados');

function separar(dados) {
  const publico = {}; const privado = {};
  Object.entries(dados).forEach(([k, v]) => {
    if (k === 'id' || v === undefined) return;
    if (CAMPOS_PRIVADOS.includes(k)) privado[k] = v || '';
    else publico[k] = v;
  });
  return { publico, privado };
}

function log(b, ent, acao, socioId, resumo) {
  b.set(doc(colRef(ent, 'auditoria')), {
    acao, colecao: 'socios', docId: socioId, resumo: resumo.slice(0, 300),
    uid: auth.currentUser?.uid || null, email: auth.currentUser?.email || null, em: serverTimestamp(),
  });
}

export async function salvarSocio(ent, id, dados) {
  const { publico, privado } = separar(dados);
  const b = writeBatch(db);
  const ref = id ? docRef(ent, 'socios', id) : doc(colRef(ent, 'socios'));
  // remove do cadastro principal qualquer resto de dado pessoal antigo
  const limpeza = id ? Object.fromEntries(CAMPOS_PRIVADOS.map((k) => [k, deleteField()])) : {};
  if (id) b.update(ref, { ...publico, ...limpeza, ...carimbo() });
  else b.set(ref, { ...publico, ...carimbo(), criadoEm: serverTimestamp() });
  b.set(privadoRef(ent, ref.id), { ...privado, entidadeId: ent, socioId: ref.id, ...carimbo() }, { merge: true });
  log(b, ent, id ? 'alterou' : 'criou', ref.id, `sócio: ${publico.nome}`);
  await b.commit();
  return ref.id;
}

// Mapa socioId -> dados pessoais (só carrega para quem pode ver)
export function usePrivados(ent, habilitado) {
  const [mapa, setMapa] = useState({});
  useEffect(() => {
    if (!ent || !habilitado) { setMapa({}); return undefined; }
    return onSnapshot(query(collectionGroup(db, 'privado'), where('entidadeId', '==', ent)),
      (s) => setMapa(Object.fromEntries(s.docs.map((d) => [d.data().socioId, d.data()]))),
      (e) => { console.error('privado', e); setMapa({}); });
  }, [ent, habilitado]);
  return mapa;
}

export async function lerPrivado(ent, socioId) {
  const s = await getDoc(privadoRef(ent, socioId));
  return s.exists() ? s.data() : {};
}

// Cadastros antigos que ainda têm CPF/endereço no documento principal
export const precisaMigrar = (s) => CAMPOS_PRIVADOS.some((k) => s[k]);

export async function migrarDadosPessoais(ent, socios) {
  const alvo = socios.filter(precisaMigrar);
  for (let i = 0; i < alvo.length; i += 150) {
    const b = writeBatch(db);
    alvo.slice(i, i + 150).forEach((s) => {
      const privado = Object.fromEntries(CAMPOS_PRIVADOS.map((k) => [k, s[k] || '']));
      b.set(privadoRef(ent, s.id), { ...privado, entidadeId: ent, socioId: s.id, ...carimbo() }, { merge: true });
      b.update(docRef(ent, 'socios', s.id), { ...Object.fromEntries(CAMPOS_PRIVADOS.map((k) => [k, deleteField()])), ...carimbo() });
    });
    log(b, ent, 'protegeu', null, `Dados pessoais de ${Math.min(150, alvo.length - i)} sócio(s) movidos para a área protegida`);
    await b.commit();
  }
  return alvo.length;
}

// Para exibir CPF a quem não pode ver o número completo
export function mascararCpf(cpf) {
  const d = (cpf || '').replace(/\D/g, '');
  return d.length === 11 ? `***.${d.slice(3, 6)}.***-**` : (cpf ? '***' : '—');
}

// ---------- Foto do sócio ----------
// Fica em socios/{id}/foto/atual: equipe e o próprio sócio veem; patrão,
// secretário e o próprio sócio podem trocar.
const fotoRef = (ent, socioId) => doc(db, 'entidades', ent, 'socios', socioId, 'foto', 'atual');

export async function salvarFoto(ent, socioId, imagem) {
  const b = writeBatch(db);
  if (imagem) b.set(fotoRef(ent, socioId), { imagem, entidadeId: ent, socioId, ...carimbo() });
  else b.delete(fotoRef(ent, socioId));
  await b.commit();
}

export function useFoto(ent, socioId) {
  const [foto, setFoto] = useState(undefined);   // undefined = carregando, null = sem foto
  useEffect(() => {
    if (!ent || !socioId) { setFoto(null); return undefined; }
    return onSnapshot(fotoRef(ent, socioId), (s) => setFoto(s.exists() ? s.data().imagem : null), () => setFoto(null));
  }, [ent, socioId]);
  return foto;
}

// Exclui o sócio por completo: cadastro, dados pessoais protegidos e foto (LGPD),
// deixando a linha obrigatória no registro de atividades.
export async function excluirSocio(ent, socio) {
  const b = writeBatch(db);
  b.set(doc(db, 'entidades', ent, 'auditoria', `del_socios_${socio.id}`), {
    acao: 'excluiu', colecao: 'socios', docId: socio.id, resumo: `sócio: ${socio.nome} (com dados pessoais e foto)`.slice(0, 300),
    uid: auth.currentUser?.uid || null, email: auth.currentUser?.email || null, em: serverTimestamp(),
  });
  b.delete(privadoRef(ent, socio.id));
  b.delete(fotoRef(ent, socio.id));
  b.delete(docRef(ent, 'socios', socio.id));
  await b.commit();
}
