import { cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useId, useState } from 'react';

export function Modal({ titulo, aberto = true, aoFechar, children, rodape, largo }) {
  useEffect(() => {
    if (!aberto) return undefined;
    const esc = (e) => e.key === 'Escape' && aoFechar?.();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [aberto, aoFechar]);
  if (!aberto) return null;
  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar?.()}>
      <div className={`modal ${largo ? 'largo' : ''}`} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="modal-topo">
          <h2>{titulo}</h2>
          <button type="button" onClick={aoFechar} aria-label="Fechar">×</button>
        </div>
        <div className="modal-corpo">{children}</div>
        {rodape && <div className="modal-rodape">{rodape}</div>}
      </div>
    </div>
  );
}

// Modal com formulário: envia com Enter e mostra "Salvando…"
export function ModalForm({ titulo, aoFechar, aoSalvar, children, largo, textoSalvar = 'Salvar', extraRodape }) {
  const [salvando, setSalvando] = useState(false);
  const notificar = useNotificar();
  async function enviar(e) {
    e.preventDefault();
    setSalvando(true);
    try {
      const ok = await aoSalvar();
      if (ok !== false) aoFechar();
    } catch (err) {
      console.error(err);
      notificar(mensagemErro(err), 'erro');
    } finally { setSalvando(false); }
  }
  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <form className={`modal ${largo ? 'largo' : ''}`} onSubmit={enviar} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="modal-topo">
          <h2>{titulo}</h2>
          <button type="button" onClick={aoFechar} aria-label="Fechar">×</button>
        </div>
        <div className="modal-corpo">{children}</div>
        <div className="modal-rodape">
          {extraRodape}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn" onClick={aoFechar}>Cancelar</button>
          <button type="submit" className="btn btn-primario" disabled={salvando}>{salvando ? 'Salvando…' : textoSalvar}</button>
        </div>
      </form>
    </div>
  );
}

export function Campo({ rotulo, ajuda, children, className = '' }) {
  // Liga o rótulo ao campo (clicar no rótulo foca o campo; leitores de tela anunciam o nome)
  const id = useId();
  const unico = isValidElement(children) && ['input', 'select', 'textarea'].includes(children.type);
  const filho = unico ? cloneElement(children, { id: children.props.id || id, 'aria-describedby': ajuda ? `${id}-ajuda` : undefined }) : children;
  return (
    <div className={`campo ${className}`}>
      <label className="campo-rotulo" htmlFor={unico ? children.props.id || id : undefined}>{rotulo}</label>
      {filho}
      {ajuda && <span className="ajuda" id={`${id}-ajuda`}>{ajuda}</span>}
    </div>
  );
}

// Liga inputs a um objeto de estado: <input {...ligar('nome')} />
export function useFormulario(inicial) {
  const [dados, setDados] = useState(inicial);
  const definir = useCallback((campo, valor) => setDados((d) => ({ ...d, [campo]: valor })), []);
  const ligar = (campo, opcoes = {}) => ({
    value: dados[campo] ?? '',
    onChange: (e) => {
      let v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      if (opcoes.numero) v = v === '' ? '' : Number(v);
      if (opcoes.mascara) v = opcoes.mascara(v);
      definir(campo, v);
    },
    ...(opcoes.obrigatorio ? { required: true } : {}),
  });
  return { dados, setDados, definir, ligar };
}

export function Selo({ tipo = 'neutro', children }) {
  return <span className={`selo selo-${tipo}`}>{children}</span>;
}

export function Vazio({ titulo, children }) {
  return (
    <div className="vazio">
      <h3>{titulo}</h3>
      {children && <div>{children}</div>}
    </div>
  );
}

export function Carregando({ texto = 'Carregando…' }) {
  return <div className="carregando">{texto}</div>;
}

export function ErroLeitura({ erro }) {
  if (!erro) return null;
  return <div className="aviso erro">Não foi possível carregar os dados: {mensagemErro(erro)}</div>;
}

export function Cabecalho({ titulo, descricao, children }) {
  return (
    <div className="cabecalho">
      <div>
        <h1>{titulo}</h1>
        {descricao && <p>{descricao}</p>}
      </div>
      {children && <div className="acoes">{children}</div>}
    </div>
  );
}

export function mensagemErro(err) {
  const c = err?.code || '';
  const mapa = {
    'permission-denied': 'seu usuário não tem permissão para esta ação.',
    'auth/invalid-credential': 'e-mail ou senha incorretos.',
    'auth/wrong-password': 'e-mail ou senha incorretos.',
    'auth/user-not-found': 'e-mail ou senha incorretos.',
    'auth/email-already-in-use': 'já existe uma conta com este e-mail.',
    'auth/weak-password': 'a senha precisa ter pelo menos 6 caracteres.',
    'auth/invalid-email': 'o e-mail informado não é válido.',
    'auth/too-many-requests': 'muitas tentativas. Aguarde alguns minutos e tente de novo.',
    'auth/network-request-failed': 'sem conexão com a internet.',
    unavailable: 'sem conexão com o servidor. Verifique a internet.',
  };
  const m = mapa[c.replace('firestore/', '')] || err?.message || 'erro desconhecido.';
  return m.charAt(0).toUpperCase() + m.slice(1);
}

// ---------- Notificações ----------
const NotCtx = createContext(() => {});
export function NotificacoesProvider({ children }) {
  const [lista, setLista] = useState([]);
  const notificar = useCallback((texto, tipo = 'ok') => {
    const id = Math.random();
    setLista((l) => [...l, { id, texto, tipo }]);
    setTimeout(() => setLista((l) => l.filter((t) => t.id !== id)), tipo === 'erro' ? 7000 : 3500);
  }, []);
  return (
    <NotCtx.Provider value={notificar}>
      {children}
      <div className="toasts" aria-live="polite">
        {lista.map((t) => <div key={t.id} className={`toast ${t.tipo === 'erro' ? 'erro' : ''}`}>{t.texto}</div>)}
      </div>
    </NotCtx.Provider>
  );
}
export const useNotificar = () => useContext(NotCtx);

// Executa uma ação com feedback e tratamento de erro
export function useAcao() {
  const notificar = useNotificar();
  return useCallback(async (fn, sucesso) => {
    try {
      await fn();
      if (sucesso) notificar(sucesso);
      return true;
    } catch (err) {
      console.error(err);
      notificar(mensagemErro(err), 'erro');
      return false;
    }
  }, [notificar]);
}

export function Abas({ abas, ativa, aoTrocar }) {
  return (
    <div className="abas" role="tablist">
      {abas.map((a) => (
        <button key={a.id} type="button" role="tab" aria-selected={ativa === a.id}
          className={ativa === a.id ? 'ativa' : ''} onClick={() => aoTrocar(a.id)}>
          {a.rotulo}{a.contagem != null && <span className="contagem">{a.contagem}</span>}
        </button>
      ))}
    </div>
  );
}

export function SeletorMes({ valor, aoMudar, rotulo = 'Mês' }) {
  return (
    <Campo rotulo={rotulo}>
      <input type="month" value={valor} onChange={(e) => e.target.value && aoMudar(e.target.value)} />
    </Campo>
  );
}
