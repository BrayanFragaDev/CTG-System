import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot, collection, query, orderBy } from 'firebase/firestore';
import { auth, db, configurado } from '../lib/firebase';
import { podeLer, podeEscrever } from '../lib/permissoes';
import { configEntidade } from '../lib/constantes';

const Ctx = createContext(null);
const CHAVE_ENT = 'galpao.entidadeAtual';

function lerLocal() { try { return localStorage.getItem(CHAVE_ENT); } catch { return null; } }
function gravarLocal(v) { try { localStorage.setItem(CHAVE_ENT, v); } catch { /* sem armazenamento */ } }

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);          // undefined = carregando
  const [perfil, setPerfil] = useState(undefined);
  const [sistemaOk, setSistemaOk] = useState(undefined);
  const [entidades, setEntidades] = useState([]);       // só para superadmin
  const [entidadeEscolhida, setEntidadeEscolhida] = useState(lerLocal());
  const [entidade, setEntidade] = useState(null);

  useEffect(() => {
    if (!configurado) return undefined;
    return onSnapshot(doc(db, 'config', 'sistema'), (s) => setSistemaOk(s.exists()), () => setSistemaOk(false));
  }, []);

  useEffect(() => (configurado ? onAuthStateChanged(auth, (u) => setUser(u)) : undefined), []);

  useEffect(() => {
    if (!user) { setPerfil(user === null ? null : undefined); return undefined; }
    return onSnapshot(
      doc(db, 'usuarios', user.uid),
      (s) => setPerfil(s.exists() ? { id: s.id, ...s.data() } : null),
      () => setPerfil(null),
    );
  }, [user]);

  const superadmin = perfil?.papel === 'superadmin' && perfil?.ativo;

  useEffect(() => {
    if (!superadmin) { setEntidades([]); return undefined; }
    return onSnapshot(query(collection(db, 'entidades'), orderBy('nome')), (s) =>
      setEntidades(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [superadmin]);

  const entidadeId = superadmin
    ? (entidades.find((e) => e.id === entidadeEscolhida)?.id || entidades[0]?.id || null)
    : perfil?.entidadeId || null;

  useEffect(() => {
    if (!entidadeId || !perfil?.ativo) { setEntidade(null); return undefined; }
    return onSnapshot(doc(db, 'entidades', entidadeId),
      (s) => setEntidade(s.exists() ? { id: s.id, ...s.data() } : null),
      () => setEntidade(null));
  }, [entidadeId, perfil?.ativo]);

  const valor = useMemo(() => {
    const papel = perfil?.ativo ? perfil.papel : null;
    return {
      user, perfil, papel, superadmin, sistemaOk, entidades, entidadeId, entidade,
      config: configEntidade(entidade),
      carregando: configurado && (user === undefined || sistemaOk === undefined || (user && perfil === undefined)),
      trocarEntidade: (id) => { setEntidadeEscolhida(id); gravarLocal(id); },
      sair: () => signOut(auth),
      pode: (modulo) => Boolean(papel) && podeLer(papel, modulo),
      podeEditar: (modulo) => Boolean(papel) && podeEscrever(papel, modulo),
    };
  }, [user, perfil, superadmin, sistemaOk, entidades, entidadeId, entidade]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
