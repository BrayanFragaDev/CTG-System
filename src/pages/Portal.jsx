import { useEffect, useState } from 'react';
import { getDoc, where, orderBy } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useColecao, docRef } from '../lib/db';
import { fmtMoeda, fmtData, fmtCompetencia, hoje, somar } from '../lib/format';
import { reciboMensalidades } from '../lib/pdf';
import { Carregando, Selo, useNotificar } from '../components/ui';
import { Marca } from '../components/Icone';
import { statusMensalidade } from './Mensalidades';

export default function Portal() {
  const { perfil, entidade, entidadeId, config, sair } = useAuth();
  const notificar = useNotificar();
  const [socio, setSocio] = useState(null);
  const mens = useColecao(entidadeId, 'mensalidades', perfil.socioId ? [where('socioId', '==', perfil.socioId)] : null, perfil.socioId);
  const eventos = useColecao(entidadeId, 'eventos', [where('data', '>=', hoje()), orderBy('data')]);

  useEffect(() => {
    if (!entidadeId || !perfil.socioId) return;
    getDoc(docRef(entidadeId, 'socios', perfil.socioId)).then((s) => setSocio(s.exists() ? { id: s.id, ...s.data() } : {})).catch(() => setSocio({}));
  }, [entidadeId, perfil.socioId]);

  const lista = [...mens.dados].sort((a, b) => b.competencia.localeCompare(a.competencia));
  const abertas = lista.filter((m) => m.status === 'aberto');
  const pagas = lista.filter((m) => m.status === 'pago');
  const agenda = eventos.dados.filter((e) => e.mostrarNoPortal !== false && e.status !== 'Cancelado');

  function copiarPix() {
    navigator.clipboard?.writeText(config.chavePix).then(() => notificar('Chave PIX copiada')).catch(() => {});
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <header className="topo-portal">
        <Marca tam={32} />
        <strong style={{ flex: 1 }}>{entidade?.nome || 'Portal do sócio'}</strong>
        <button type="button" onClick={sair}>Sair</button>
      </header>
      <main className="conteudo" style={{ maxWidth: 960, margin: '0 auto' }}>
        <div className="cabecalho">
          <div>
            <h1>Buenas, {(socio?.nome || perfil.nome || '').split(' ')[0]}!</h1>
            <p>{socio?.matricula ? `Matrícula ${socio.matricula}` : ''}{socio?.categoria ? ` — ${socio.categoria}` : ''}</p>
          </div>
        </div>

        {!perfil.socioId && <div className="aviso">Seu acesso ainda não foi ligado a um cadastro de sócio. Fale com a secretaria.</div>}

        <div className="indicadores">
          <div className={`indicador ${abertas.some((m) => m.vencimento < hoje()) ? 'alerta' : ''}`}>
            <div className="rotulo">Em aberto</div><div className="valor">{fmtMoeda(somar(abertas))}</div>
            <div className="detalhe">{abertas.length ? `${abertas.length} mensalidade(s)` : 'Tudo em dia. Obrigado!'}</div>
          </div>
          <div className="indicador positivo"><div className="rotulo">Pagas</div><div className="valor">{pagas.length}</div><div className="detalhe">{pagas[0] ? `Última: ${fmtCompetencia(pagas[0].competencia)}` : '—'}</div></div>
        </div>

        {abertas.length > 0 && config.chavePix && (
          <div className="aviso info" style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ flex: 1 }}>Pague por PIX para a chave <strong>{config.chavePix}</strong> e envie o comprovante à tesouraria.</span>
            <button type="button" className="btn btn-peq" onClick={copiarPix}>Copiar chave</button>
          </div>
        )}

        <section className="painel">
          <div className="painel-titulo"><h2>Minhas mensalidades</h2></div>
          {mens.carregando ? <Carregando /> : !lista.length ? <div className="painel-corpo"><p className="sub">Nenhuma mensalidade lançada.</p></div> : (
            <div className="tabela-wrap">
              <table>
                <thead><tr><th>Mês</th><th className="esconder-mobile">Vencimento</th><th className="num">Valor</th><th>Situação</th><th /></tr></thead>
                <tbody>
                  {lista.map((m) => {
                    const st = statusMensalidade(m);
                    return (
                      <tr key={m.id}>
                        <td>{fmtCompetencia(m.competencia)}</td>
                        <td className="esconder-mobile">{fmtData(m.vencimento)}</td>
                        <td className="num">{fmtMoeda(m.valorPago ?? m.valor)}</td>
                        <td><Selo tipo={st.tipo}>{st.texto}</Selo></td>
                        <td className="acoes-celula">{m.status === 'pago' && <button type="button" className="btn btn-peq" onClick={() => reciboMensalidades(entidade, socio, [m])}>Recibo</button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <div className="espaco" />

        <div className="grade grade-2">
          <section className="painel">
            <div className="painel-titulo"><h2>Agenda</h2></div>
            <div className="painel-corpo">
              {!agenda.length ? <p className="sub">Nenhum evento marcado.</p> : (
                <ul className="lista-simples">
                  {agenda.map((e) => (
                    <li key={e.id}><span><strong>{e.nome}</strong><span className="sub">{[e.tipo, e.atracao, e.traje].filter(Boolean).join(' — ')}</span>
                      {(e.precoSocio != null) && <span className="sub">Ingresso sócio: {fmtMoeda(e.precoSocio)}</span>}</span>
                      <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtData(e.data)}<span className="sub">{e.hora}</span></span></li>
                  ))}
                </ul>
              )}
            </div>
          </section>
          <section className="painel">
            <div className="painel-titulo"><h2>Meu cadastro</h2></div>
            <div className="painel-corpo">
              {!socio ? <Carregando /> : (
                <dl className="ficha">
                  <div><dt>Nome</dt><dd>{socio.nome || perfil.nome}</dd></div>
                  <div><dt>Telefone</dt><dd>{socio.telefone || '—'}</dd></div>
                  <div><dt>E-mail</dt><dd>{socio.email || perfil.email}</dd></div>
                  <div><dt>Sócio desde</dt><dd>{fmtData(socio.dataAdmissao)}</dd></div>
                  <div><dt>Cartão MTG</dt><dd>{socio.carteiraMtg || '—'}</dd></div>
                </dl>
              )}
              <p className="sub" style={{ marginTop: '1rem', color: 'var(--tinta-3)' }}>Algum dado errado? Avise a secretaria{entidade?.telefone ? ` pelo ${entidade.telefone}` : ''}.</p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
