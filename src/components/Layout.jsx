import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PAPEIS } from '../lib/permissoes';
import Icone, { Marca } from './Icone';

const GRUPOS = [
  { titulo: null, itens: [{ para: '/', rotulo: 'Painel', icone: 'painel', modulo: null }] },
  { titulo: 'Quadro social', itens: [
    { para: '/socios', rotulo: 'Sócios', icone: 'socios', modulo: 'socios' },
    { para: '/mensalidades', rotulo: 'Mensalidades', icone: 'mensalidades', modulo: 'mensalidades' },
  ] },
  { titulo: 'Financeiro', itens: [
    { para: '/contas', rotulo: 'Contas a pagar e receber', icone: 'contas', modulo: 'contas' },
    { para: '/caixa', rotulo: 'Caixa', icone: 'caixa', modulo: 'caixa' },
    { para: '/relatorios', rotulo: 'Relatórios', icone: 'relatorios', modulo: 'caixa' },
  ] },
  { titulo: 'Cultura e eventos', itens: [
    { para: '/eventos', rotulo: 'Eventos e bailes', icone: 'eventos', modulo: 'eventos' },
    { para: '/invernadas', rotulo: 'Invernadas', icone: 'invernadas', modulo: 'invernadas' },
    { para: '/patrimonio', rotulo: 'Patrimônio', icone: 'patrimonio', modulo: 'patrimonio' },
  ] },
  { titulo: 'Administração', itens: [
    { para: '/usuarios', rotulo: 'Usuários e acessos', icone: 'usuarios', modulo: 'usuarios' },
    { para: '/configuracoes', rotulo: 'Dados da entidade', icone: 'config', modulo: 'configuracoes' },
    { para: '/entidades', rotulo: 'Entidades', icone: 'entidades', modulo: 'superadmin' },
  ] },
];

export default function Layout() {
  const { perfil, papel, entidade, entidades, entidadeId, trocarEntidade, superadmin, sair, pode } = useAuth();
  const [aberto, setAberto] = useState(false);
  const loc = useLocation();
  const [ultimaRota, setUltimaRota] = useState(loc.pathname);
  if (ultimaRota !== loc.pathname) { setUltimaRota(loc.pathname); setAberto(false); }

  const visivel = (m) => m === null || (m === 'superadmin' ? superadmin : pode(m));

  return (
    <div className={`app ${aberto ? 'menu-aberto' : ''}`}>
      <div className="cortina" onClick={() => setAberto(false)} />
      <aside className="lateral">
        <div className="marca">
          <Marca />
          <div><strong>Galpão</strong><span>Gestão tradicionalista</span></div>
        </div>
        {superadmin && entidades.length > 0 ? (
          <div className="seletor-entidade">
            <label htmlFor="ent-sel">Entidade</label>
            <select id="ent-sel" value={entidadeId || ''} onChange={(e) => trocarEntidade(e.target.value)}>
              {entidades.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </div>
        ) : entidade && (
          <div className="entidade-nome">
            <strong>{entidade.nome}</strong>
            <span>{[entidade.cidade, entidade.rt && `${entidade.rt}ª RT`].filter(Boolean).join(', ')}</span>
          </div>
        )}
        <nav className="menu" aria-label="Menu principal">
          {GRUPOS.map((g) => {
            const itens = g.itens.filter((i) => visivel(i.modulo));
            if (!itens.length) return null;
            return (
              <div className="menu-grupo" key={g.titulo || 'inicio'}>
                {g.titulo && <span>{g.titulo}</span>}
                {itens.map((i) => (
                  <NavLink key={i.para} to={i.para} end={i.para === '/'} className={({ isActive }) => (isActive ? 'ativo' : '')}>
                    <Icone nome={i.icone} />{i.rotulo}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="rodape-lateral">
          <div className="quem">{perfil?.nome || perfil?.email}</div>
          <div className="papel">{PAPEIS[papel]?.nome}</div>
          <button type="button" onClick={sair}>Sair</button>
        </div>
      </aside>
      <div style={{ minWidth: 0 }}>
        <header className="topo-mobile">
          <button type="button" onClick={() => setAberto(true)} aria-label="Abrir menu"><Icone nome="menu" /></button>
          <strong>{entidade?.nome || 'Galpão'}</strong>
        </header>
        <main className="conteudo">
          {!entidadeId && superadmin && loc.pathname !== '/entidades'
            ? <div className="aviso info">Cadastre a primeira entidade em <NavLink to="/entidades">Entidades</NavLink> para começar.</div>
            : <Outlet />}
        </main>
      </div>
    </div>
  );
}
