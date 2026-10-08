import { useEffect, useState } from 'react';
import {
  collection, doc, query, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch, getDocs,
} from 'firebase/firestore';
import { db, auth } from './firebase';

export const colRef = (ent, nome) => collection(db, 'entidades', ent, nome);
export const docRef = (ent, nome, id) => doc(db, 'entidades', ent, nome, id);

const autoria = () => ({ atualizadoEm: serverTimestamp(), atualizadoPor: auth.currentUser?.email || null });

export async function salvar(ent, nome, id, dados) {
  const limpo = Object.fromEntries(Object.entries(dados).filter(([k, v]) => k !== 'id' && v !== undefined));
  if (id) {
    await updateDoc(docRef(ent, nome, id), { ...limpo, ...autoria() });
    return id;
  }
  const r = await addDoc(colRef(ent, nome), { ...limpo, ...autoria(), criadoEm: serverTimestamp() });
  return r.id;
}

export const excluir = (ent, nome, id) => deleteDoc(docRef(ent, nome, id));

export function novoLote() {
  const b = writeBatch(db);
  return {
    criar(ent, nome, dados) {
      const r = doc(colRef(ent, nome));
      b.set(r, { ...dados, ...autoria(), criadoEm: serverTimestamp() });
      return r.id;
    },
    atualizar(ent, nome, id, dados) { b.update(docRef(ent, nome, id), { ...dados, ...autoria() }); },
    excluir(ent, nome, id) { b.delete(docRef(ent, nome, id)); },
    commit: () => b.commit(),
  };
}

// Firestore aceita até 500 operações por lote; divide em vários quando precisa.
export async function emLotes(itens, fn, tamanho = 400) {
  for (let i = 0; i < itens.length; i += tamanho) {
    const lote = novoLote();
    itens.slice(i, i + tamanho).forEach((it) => fn(lote, it));
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
