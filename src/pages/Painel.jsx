import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { where, orderBy, limit } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useColecao } from '../lib/db';
import { saldosAntesDe, CATEGORIA_TRANSFERENCIA } from '../lib/saldos';
import { fmtMoeda, fmtData, fmtCompetencia, competenciaAtual, hoje, somar, somarMeses, diasEntre, MESES_CURTOS } from '../lib/format';
import { Selo } from '../components/ui';
import { eventoSemAviso } from './Avisos';
import { precisaMigrar } from '../lib/socios';

function saudacao() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenas';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export default function Painel() {
  const { entidadeId, entidade, perfil, config, pode, podeEditar } = useAuth();
  const comp = competenciaAtual();
  const inicioGrafico = `${somarMeses(comp, -5)}-01`;
  const fin = pode('caixa');

  const socios = useColecao(entidadeId, 'socios', [where('situacao', '==', 'Ativo')]);
  const mens = useColecao(entidadeId, 'mensalidades', fin ? [where('competencia', '==', comp)] : null, comp);
  // só igualdade no banco (dispensa índice composto); o vencimento é filtrado aqui
  const abertasTodas = useColecao(entidadeId, 'mensalidades', fin ? [where('status', '==', 'aberto')] : null);
  const atrasadas = { dados: abertasTodas.dados.filter((m) => m.vencimento < hoje()) };
  const contas = useColecao(entidadeId, 'contas', fin ? [where('status', '==', 'aberto')] : null);
  const movs = useColecao(entidadeId, 'caixa', fin ? [where('data', '>=', inicioGrafico), orderBy('data')] : null, inicioGrafico);
  const eventos = useColecao(entidadeId, 'eventos', [where('data', '>=', hoje()), orderBy('data'), limit(12)]);
  const verEstoque = pode('estoque');
  const produtos = useColecao(entidadeId, 'produtos', verEstoque ? [where('ativo', '==', true)] : null);
  const copas = useColecao(entidadeId, 'copa', verEstoque ? [where('status', '==', 'fechada')] : null);

  const [saldos, setSaldos] = useState(null);
  useEffect(() => {
    if (!fin || !entidadeId) return undefined;
    let vivo = true;
    saldosAntesDe(entidadeId, config.contasFinanceiras, '9999-12-31').then((s) => vivo && setSaldos(s)).catch(() => vivo && setSaldos(null));
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entidadeId, fin, config.contasFinanceiras.join('|'), movs.dados.length]);

  const saldoTotal = saldos ? Object.values(saldos).reduce((s, v) => s + v, 0) : null;
  const validas = mens.dados.filter((m) => m.status !== 'cancelado');
  const pagas = validas.filter((m) => m.status === 'pago');
  const aPagar = contas.dados.filter((c) => c.tipo === 'pagar').sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const urgentes = aPagar.filter((c) => diasEntre(hoje(), c.vencimento) <= 7);
  const vencidas = aPagar.filter((c) => c.vencimento < hoje());

  // O que precisa de atenção hoje, em ordem de urgência
  const pendencias = [
    ...eventos.dados.filter(eventoSemAviso).filter(() => podeEditar('avisos')).map((e) => ({
      chave: `ev${e.id}`, tipo: 'alerta', para: '/eventos', texto: `${e.nome} está confirmado, mas os sócios ainda não foram avisados`, acao: 'Avisar',
    })),
    fin && vencidas.length > 0 && { chave: 'cv', tipo: 'alerta', para: '/contas', texto: `${vencidas.length} conta(s) a pagar vencida(s), somando ${fmtMoeda(somar(vencidas))}`, acao: 'Ver contas' },
    fin && atrasadas.dados.length > 0 && { chave: 'ma', tipo: 'atencao', para: '/mensalidades', texto: `${new Set(atrasadas.dados.map((m) => m.socioId)).size} sócio(s) com mensalidade em atraso`, acao: 'Cobrar' },
    fin && !mens.carregando && !validas.length && { chave: 'mg', tipo: 'atencao', para: '/mensalidades', texto: `As mensalidades de ${fmtCompetencia(comp).split('/')[0].toLowerCase()} ainda não foram geradas`, acao: 'Gerar' },
    podeEditar('caixa') && copas.dados.length > 0 && { chave: 'cp', tipo: 'alerta', para: '/estoque', texto: `${copas.dados.length} fechamento(s) de copa aguardando a conferência do tesoureiro`, acao: 'Conferir' },
    verEstoque && produtos.dados.filter((p) => Number(p.estoqueMinimo) > 0 && Number(p.estoque) <= Number(p.estoqueMinimo)).length > 0 && {
      chave: 'es', tipo: 'atencao', para: '/estoque',
      texto: `Repor na copa: ${produtos.dados.filter((p) => Number(p.estoqueMinimo) > 0 && Number(p.estoque) <= Number(p.estoqueMinimo)).map((p) => p.nome).slice(0, 3).join(', ')}`,
      acao: 'Ver estoque',
    },
    podeEditar('socios') && socios.dados.some(precisaMigrar) && { chave: 'lg', tipo: 'atencao', para: '/socios', texto: 'Há CPFs e endereços fora da área protegida', acao: 'Proteger' },
    podeEditar('socios') && socios.dados.filter((s) => !s.consentimentoLgpd).length > 0 && { chave: 'cs', tipo: 'info', para: '/socios', texto: `${socios.dados.filter((s) => !s.consentimentoLgpd).length} sócio(s) ativo(s) sem autorização de uso de dados (LGPD) registrada`, acao: 'Ver sócios' },
  ].filter(Boolean).sort((a, b) => ['alerta', 'atencao', 'info'].indexOf(a.tipo) - ['alerta', 'atencao', 'info'].indexOf(b.tipo));

  const mesAtual = hoje().slice(5, 7);
  const aniversariantes = socios.dados.filter((s) => s.nascimento?.slice(5, 7) === mesAtual)
    .sort((a, b) => a.nascimento.slice(8).localeCompare(b.nascimento.slice(8)));

  const grafico = Array.from({ length: 6 }, (_, i) => {
    const c = somarMeses(comp, i - 5);
    const l = movs.dados.filter((m) => m.data.startsWith(c) && m.categoria !== CATEGORIA_TRANSFERENCIA);
    return { c, e: somar(l.filter((m) => m.tipo === 'entrada')), s: somar(l.filter((m) => m.tipo === 'saida')) };
  });
  const maxG = Math.max(1, ...grafico.flatMap((g) => [g.e, g.s]));

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>{saudacao()}, {(perfil?.nome || '').split(' ')[0] || 'tchê'}!</h1>
          <p>{entidade?.nome} — {fmtData(hoje())}</p>
        </div>
      </div>

      {pendencias.length > 0 && (
        <section className="pendencias" aria-label="O que precisa de atenção">
          {pendencias.slice(0, 5).map((p) => (
            <Link key={p.chave} to={p.para} className={`pendencia ${p.tipo}`}>
              <span>{p.texto}</span><b>{p.acao}</b>
            </Link>
          ))}
        </section>
      )}

      <div className="indicadores">
        {fin && <div className="indicador"><div className="rotulo">Saldo em caixa e banco</div><div className="valor" style={{ color: saldoTotal < 0 ? 'var(--lenco)' : undefined }}>{saldoTotal == null ? '…' : fmtMoeda(saldoTotal)}</div>
          {saldos && <div className="detalhe">{Object.entries(saldos).map(([c, v]) => `${c}: ${fmtMoeda(v)}`).join('  |  ')}</div>}</div>}
        <div className="indicador"><div className="rotulo">Sócios ativos</div><div className="valor">{socios.carregando ? '…' : socios.dados.length}</div></div>
        {fin && <div className="indicador positivo"><div className="rotulo">Mensalidades de {fmtCompetencia(comp).split('/')[0].toLowerCase()}</div><div className="valor">{fmtMoeda(somar(pagas, 'valorPago'))}</div><div className="detalhe">{pagas.length} de {validas.length} pagas, previsto {fmtMoeda(somar(validas))}</div></div>}
        {fin && <div className={`indicador ${atrasadas.dados.length ? 'alerta' : ''}`}><div className="rotulo">Mensalidades em atraso</div><div className="valor">{fmtMoeda(somar(atrasadas.dados))}</div><div className="detalhe">{atrasadas.dados.length} mensalidade(s), {new Set(atrasadas.dados.map((m) => m.socioId)).size} sócio(s)</div></div>}
      </div>

      <div className="grade grade-2">
        {fin && (
          <section className="painel">
            <div className="painel-titulo"><h2>Entradas e saídas</h2><div className="legenda"><span><i style={{ background: 'var(--verde-ok)' }} />Entradas</span><span><i style={{ background: 'var(--lenco)' }} />Saídas</span></div></div>
            <div className="painel-corpo">
              <div className="grafico-barras" role="img" aria-label="Entradas e saídas dos últimos seis meses">
                {grafico.map((g) => (
                  <div className="col" key={g.c} title={`${fmtCompetencia(g.c)}: entradas ${fmtMoeda(g.e)}, saídas ${fmtMoeda(g.s)}`}>
                    <div className="par">
                      <div className="b e" style={{ height: `${(g.e / maxG) * 100}%` }} />
                      <div className="b s" style={{ height: `${(g.s / maxG) * 100}%` }} />
                    </div>
                    <small>{MESES_CURTOS[Number(g.c.slice(5)) - 1]}</small>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {fin && (
          <section className="painel">
            <div className="painel-titulo"><h2>Contas a pagar</h2><Link to="/contas">Ver todas</Link></div>
            <div className="painel-corpo">
              {!aPagar.length ? <p className="sub">Nenhuma conta em aberto.</p> : (
                <ul className="lista-simples">
                  {(urgentes.length ? urgentes : aPagar).slice(0, 6).map((c) => (
                    <li key={c.id}>
                      <span>{c.descricao}<span className="sub">{fmtData(c.vencimento)}</span></span>
                      <span style={{ textAlign: 'right' }}><strong className="num">{fmtMoeda(c.valor)}</strong><br />
                        {c.vencimento < hoje() ? <Selo tipo="atraso">vencida</Selo> : c.vencimento === hoje() ? <Selo tipo="pendente">hoje</Selo> : null}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        <section className="painel">
          <div className="painel-titulo"><h2>Próximos eventos</h2>{pode('eventos') && <Link to="/eventos">Agenda</Link>}</div>
          <div className="painel-corpo">
            {!eventos.dados.length ? <p className="sub">Nenhum evento marcado.</p> : (
              <ul className="lista-simples">
                {eventos.dados.slice(0, 4).map((e) => (
                  <li key={e.id}><span><strong>{e.nome}</strong><span className="sub">{e.tipo}{e.local ? `, ${e.local}` : ''}</span></span>
                    <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtData(e.data)}<span className="sub">{diasEntre(hoje(), e.data) === 0 ? 'hoje' : `em ${diasEntre(hoje(), e.data)} dias`}</span></span></li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="painel">
          <div className="painel-titulo"><h2>Aniversariantes do mês</h2></div>
          <div className="painel-corpo">
            {!aniversariantes.length ? <p className="sub">Nenhum sócio ativo faz aniversário este mês.</p> : (
              <ul className="lista-simples">
                {aniversariantes.slice(0, 8).map((s) => (
                  <li key={s.id}><span>{s.nome}</span><span className="num">{s.nascimento.slice(8)}/{mesAtual}{s.nascimento.slice(5) === hoje().slice(5) && <> <Selo tipo="ok">hoje</Selo></>}</span></li>
                ))}
                {aniversariantes.length > 8 && <li><span className="sub">e mais {aniversariantes.length - 8}</span></li>}
              </ul>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
