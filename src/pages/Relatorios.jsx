import { useEffect, useMemo, useState } from 'react';
import { where, orderBy } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { buscar } from '../lib/db';
import { saldosAntesDe, CATEGORIA_TRANSFERENCIA } from '../lib/saldos';
import { fmtMoeda, fmtData, fmtCompetencia, fmtCompetenciaCurta, hoje, somar, arred, MESES, idade, ultimoDiaMes, competenciaAtual } from '../lib/format';
import { relatorioPdf } from '../lib/pdf';
import { baixarCsv } from '../lib/csv';
import { Abas, Cabecalho, Campo, Carregando, Vazio, mensagemErro } from '../components/ui';
import Icone from '../components/Icone';

export default function Relatorios() {
  const { pode } = useAuth();
  const [aba, setAba] = useState('balancete');
  const abas = [
    { id: 'balancete', rotulo: 'Receitas e despesas' },
    pode('mensalidades') && { id: 'inadimplencia', rotulo: 'Inadimplência' },
    pode('mensalidades') && { id: 'arrecadacao', rotulo: 'Arrecadação do ano' },
    pode('socios') && { id: 'aniversariantes', rotulo: 'Aniversariantes' },
  ].filter(Boolean);
  return (
    <>
      <Cabecalho titulo="Relatórios" descricao="Para a prestação de contas em assembleia, o conselho fiscal e a cobrança." />
      <div className="painel">
        <Abas ativa={aba} aoTrocar={setAba} abas={abas} />
        {aba === 'balancete' && <Balancete />}
        {aba === 'inadimplencia' && <Inadimplencia />}
        {aba === 'arrecadacao' && <Arrecadacao />}
        {aba === 'aniversariantes' && <Aniversariantes />}
      </div>
    </>
  );
}

function useCarga(fn, deps) {
  const [estado, setEstado] = useState({ dados: null, erro: null });
  useEffect(() => {
    let vivo = true;
    setEstado({ dados: null, erro: null });
    fn().then((d) => vivo && setEstado({ dados: d, erro: null })).catch((e) => { console.error(e); if (vivo) setEstado({ dados: null, erro: e }); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return estado;
}

function Balancete() {
  const { entidadeId, entidade, config } = useAuth();
  const ano = hoje().slice(0, 4);
  const [de, setDe] = useState(`${competenciaAtual()}-01`);
  const [ate, setAte] = useState(ultimoDiaMes(competenciaAtual()));
  const { dados, erro } = useCarga(async () => {
    const [movs, saldos] = await Promise.all([
      buscar(entidadeId, 'caixa', where('data', '>=', de), where('data', '<=', ate), orderBy('data')),
      saldosAntesDe(entidadeId, config.contasFinanceiras, de),
    ]);
    return { movs, saldos };
  }, [entidadeId, de, ate, config.contasFinanceiras.join('|')]);

  const r = useMemo(() => {
    if (!dados) return null;
    const semTransf = dados.movs.filter((m) => m.categoria !== CATEGORIA_TRANSFERENCIA);
    const agrupar = (tipo) => {
      const g = {};
      semTransf.filter((m) => m.tipo === tipo).forEach((m) => { g[m.categoria] = arred((g[m.categoria] || 0) + m.valor); });
      return Object.entries(g).sort((a, b) => b[1] - a[1]);
    };
    const receitas = agrupar('entrada');
    const despesas = agrupar('saida');
    const totR = arred(receitas.reduce((s, [, v]) => s + v, 0));
    const totD = arred(despesas.reduce((s, [, v]) => s + v, 0));
    const saldoIni = arred(Object.values(dados.saldos).reduce((s, v) => s + v, 0));
    const porConta = config.contasFinanceiras.map((c) => {
      const mv = dados.movs.filter((m) => m.conta === c);
      const ini = dados.saldos[c] || 0;
      return [c, ini, arred(ini + somar(mv.filter((m) => m.tipo === 'entrada')) - somar(mv.filter((m) => m.tipo === 'saida')))];
    });
    return { receitas, despesas, totR, totD, saldoIni, saldoFim: arred(porConta.reduce((s, p) => s + p[2], 0)), porConta };
  }, [dados, config.contasFinanceiras]);

  function pdf() {
    relatorioPdf({
      entidade, titulo: 'Demonstrativo de receitas e despesas', subtitulo: `Período de ${fmtData(de)} a ${fmtData(ate)}`,
      resumo: [['Saldo inicial', fmtMoeda(r.saldoIni)], ['Total de receitas', fmtMoeda(r.totR)], ['Total de despesas', fmtMoeda(r.totD)], ['Resultado do período', fmtMoeda(r.totR - r.totD)], ['Saldo final', fmtMoeda(r.saldoFim)]],
      secoes: [
        { titulo: 'Receitas', colunas: ['Categoria', 'Valor', '%'], linhas: r.receitas.map(([c, v]) => [c, fmtMoeda(v), r.totR ? `${((v / r.totR) * 100).toFixed(1).replace('.', ',')}%` : '']), rodape: ['Total', fmtMoeda(r.totR), '100%'], alinharDireita: [1, 2] },
        { titulo: 'Despesas', colunas: ['Categoria', 'Valor', '%'], linhas: r.despesas.map(([c, v]) => [c, fmtMoeda(v), r.totD ? `${((v / r.totD) * 100).toFixed(1).replace('.', ',')}%` : '']), rodape: ['Total', fmtMoeda(r.totD), '100%'], alinharDireita: [1, 2] },
        { titulo: 'Saldos por conta', colunas: ['Conta', 'Saldo inicial', 'Saldo final'], linhas: r.porConta.map(([c, i, f]) => [c, fmtMoeda(i), fmtMoeda(f)]), rodape: ['Total', fmtMoeda(r.saldoIni), fmtMoeda(r.saldoFim)], alinharDireita: [1, 2] },
      ],
    });
  }

  return (
    <>
      <div className="filtros">
        <Campo rotulo="De"><input type="date" value={de} onChange={(e) => e.target.value && setDe(e.target.value)} /></Campo>
        <Campo rotulo="Até"><input type="date" value={ate} onChange={(e) => e.target.value && setAte(e.target.value)} /></Campo>
        <div className="acoes">
          <button type="button" className="btn btn-peq" onClick={() => { setDe(`${ano}-01-01`); setAte(`${ano}-12-31`); }}>Ano de {ano}</button>
          <button type="button" className="btn btn-peq" onClick={() => { setDe(`${competenciaAtual()}-01`); setAte(ultimoDiaMes(competenciaAtual())); }}>Este mês</button>
        </div>
        <div className="acoes" style={{ marginLeft: 'auto' }}>{r && <button type="button" className="btn btn-primario" onClick={pdf}><Icone nome="pdf" tam={18} />Baixar PDF</button>}</div>
      </div>
      {erro ? <div className="painel-corpo"><div className="aviso erro">{mensagemErro(erro)}</div></div> : !r ? <Carregando /> : (
        <div className="painel-corpo">
          <div className="indicadores">
            <div className="indicador"><div className="rotulo">Saldo inicial</div><div className="valor">{fmtMoeda(r.saldoIni)}</div></div>
            <div className="indicador positivo"><div className="rotulo">Receitas</div><div className="valor">{fmtMoeda(r.totR)}</div></div>
            <div className="indicador alerta"><div className="rotulo">Despesas</div><div className="valor">{fmtMoeda(r.totD)}</div></div>
            <div className={`indicador ${r.totR - r.totD >= 0 ? 'positivo' : 'alerta'}`}><div className="rotulo">Resultado</div><div className="valor">{fmtMoeda(r.totR - r.totD)}</div></div>
            <div className="indicador"><div className="rotulo">Saldo final</div><div className="valor">{fmtMoeda(r.saldoFim)}</div></div>
          </div>
          <div className="grade grade-2">
            <TabelaCategorias titulo="Receitas" itens={r.receitas} total={r.totR} cor="var(--verde-ok)" />
            <TabelaCategorias titulo="Despesas" itens={r.despesas} total={r.totD} cor="var(--lenco)" />
          </div>
        </div>
      )}
    </>
  );
}

function TabelaCategorias({ titulo, itens, total, cor }) {
  return (
    <div>
      <h3 style={{ marginBottom: '.5rem' }}>{titulo}</h3>
      {!itens.length ? <p className="sub">Nada no período.</p> : (
        <ul className="lista-simples">
          {itens.map(([c, v]) => (
            <li key={c} style={{ display: 'block' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{c}</span><strong className="num">{fmtMoeda(v)}</strong></div>
              <div className="barra" style={{ height: 6, marginTop: 4 }}><div style={{ width: `${total ? (v / total) * 100 : 0}%`, background: cor }} /></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Inadimplencia() {
  const { entidadeId, entidade } = useAuth();
  const { dados, erro } = useCarga(() => buscar(entidadeId, 'mensalidades', where('status', '==', 'aberto')), [entidadeId]);
  const grupos = useMemo(() => {
    if (!dados) return null;
    const g = {};
    dados.filter((m) => m.vencimento < hoje()).forEach((m) => {
      g[m.socioId] = g[m.socioId] || { nome: m.socioNome, telefone: m.socioTelefone, itens: [] };
      g[m.socioId].itens.push(m);
    });
    return Object.values(g).map((x) => ({ ...x, total: somar(x.itens), itens: x.itens.sort((a, b) => a.competencia.localeCompare(b.competencia)) }))
      .sort((a, b) => b.itens.length - a.itens.length || b.total - a.total);
  }, [dados]);
  const total = grupos ? arred(grupos.reduce((s, g) => s + g.total, 0)) : 0;

  function pdf() {
    relatorioPdf({
      entidade, titulo: 'Relatório de inadimplência', subtitulo: `Posição em ${fmtData(hoje())}`,
      resumo: [['Sócios com atraso', grupos.length], ['Total em atraso', fmtMoeda(total)]],
      secoes: [{ colunas: ['Sócio', 'Telefone', 'Meses', 'Competências', 'Total'], linhas: grupos.map((g) => [g.nome, g.telefone || '', g.itens.length, g.itens.map((m) => fmtCompetenciaCurta(m.competencia)).join(', '), fmtMoeda(g.total)]), rodape: ['Total', '', '', '', fmtMoeda(total)], alinharDireita: [2, 4] }],
    });
  }
  function csv() {
    baixarCsv('inadimplencia', ['Sócio', 'Telefone', 'Meses em atraso', 'Competências', 'Total'], grupos.map((g) => [g.nome, g.telefone, g.itens.length, g.itens.map((m) => fmtCompetencia(m.competencia)).join(', '), g.total.toFixed(2).replace('.', ',')]));
  }

  if (erro) return <div className="painel-corpo"><div className="aviso erro">{mensagemErro(erro)}</div></div>;
  if (!grupos) return <Carregando />;
  return (
    <>
      <div className="filtros">
        <div><strong>{grupos.length}</strong> sócio(s) com mensalidades vencidas, somando <strong>{fmtMoeda(total)}</strong></div>
        <div className="acoes" style={{ marginLeft: 'auto' }}>
          {grupos.length > 0 && <><button type="button" className="btn" onClick={csv}>Planilha</button><button type="button" className="btn btn-primario" onClick={pdf}><Icone nome="pdf" tam={18} />Baixar PDF</button></>}
        </div>
      </div>
      {!grupos.length ? <Vazio titulo="Ninguém em atraso. Tropa em dia!" /> : (
        <div className="tabela-wrap">
          <table>
            <thead><tr><th>Sócio</th><th className="num">Meses</th><th className="esconder-mobile">Competências</th><th className="num">Total</th></tr></thead>
            <tbody>{grupos.map((g) => (
              <tr key={g.nome + g.total}><td><strong>{g.nome}</strong><span className="sub">{g.telefone}</span></td><td className="num">{g.itens.length}</td>
                <td className="esconder-mobile">{g.itens.map((m) => fmtCompetenciaCurta(m.competencia)).join(', ')}</td><td className="num">{fmtMoeda(g.total)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Arrecadacao() {
  const { entidadeId, entidade } = useAuth();
  const [ano, setAno] = useState(Number(hoje().slice(0, 4)));
  const { dados, erro } = useCarga(() => buscar(entidadeId, 'mensalidades', where('competencia', '>=', `${ano}-01`), where('competencia', '<=', `${ano}-12`)), [entidadeId, ano]);
  const meses = useMemo(() => {
    if (!dados) return null;
    return MESES.map((nome, i) => {
      const comp = `${ano}-${String(i + 1).padStart(2, '0')}`;
      const l = dados.filter((m) => m.competencia === comp && m.status !== 'cancelado');
      const pagas = l.filter((m) => m.status === 'pago');
      return { nome, qtd: l.length, pagas: pagas.length, previsto: somar(l), recebido: somar(pagas, 'valorPago'), aberto: somar(l.filter((m) => m.status === 'aberto')) };
    });
  }, [dados, ano]);
  const tot = meses && { previsto: somar(meses, 'previsto'), recebido: somar(meses, 'recebido'), aberto: somar(meses, 'aberto') };

  function pdf() {
    relatorioPdf({
      entidade, titulo: `Arrecadação de mensalidades — ${ano}`,
      secoes: [{ colunas: ['Mês', 'Mensalidades', 'Pagas', 'Previsto', 'Recebido', 'Em aberto', 'Adimplência'],
        linhas: meses.map((m) => [m.nome, m.qtd, m.pagas, fmtMoeda(m.previsto), fmtMoeda(m.recebido), fmtMoeda(m.aberto), m.qtd ? `${Math.round((m.pagas / m.qtd) * 100)}%` : '—']),
        rodape: ['Total', '', '', fmtMoeda(tot.previsto), fmtMoeda(tot.recebido), fmtMoeda(tot.aberto), ''], alinharDireita: [1, 2, 3, 4, 5, 6] }],
    });
  }

  return (
    <>
      <div className="filtros">
        <Campo rotulo="Ano"><input type="number" min="2000" max="2100" value={ano} onChange={(e) => setAno(Number(e.target.value) || ano)} /></Campo>
        <div className="acoes" style={{ marginLeft: 'auto' }}>{meses && <button type="button" className="btn btn-primario" onClick={pdf}><Icone nome="pdf" tam={18} />Baixar PDF</button>}</div>
      </div>
      {erro ? <div className="painel-corpo"><div className="aviso erro">{mensagemErro(erro)}</div></div> : !meses ? <Carregando /> : (
        <div className="tabela-wrap">
          <table>
            <thead><tr><th>Mês</th><th className="num">Pagas</th><th className="num">Previsto</th><th className="num">Recebido</th><th className="num">Em aberto</th><th style={{ width: '22%' }} className="esconder-mobile">Adimplência</th></tr></thead>
            <tbody>{meses.map((m) => (
              <tr key={m.nome}><td>{m.nome}</td><td className="num">{m.pagas}/{m.qtd}</td><td className="num">{fmtMoeda(m.previsto)}</td><td className="num">{fmtMoeda(m.recebido)}</td><td className="num">{fmtMoeda(m.aberto)}</td>
                <td className="esconder-mobile">{m.qtd ? <div className="barra"><div style={{ width: `${(m.pagas / m.qtd) * 100}%` }} /></div> : '—'}</td></tr>
            ))}</tbody>
            <tfoot><tr><td>Total</td><td /><td className="num">{fmtMoeda(tot.previsto)}</td><td className="num">{fmtMoeda(tot.recebido)}</td><td className="num">{fmtMoeda(tot.aberto)}</td><td className="esconder-mobile" /></tr></tfoot>
          </table>
        </div>
      )}
    </>
  );
}

function Aniversariantes() {
  const { entidadeId, entidade } = useAuth();
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const { dados, erro } = useCarga(() => buscar(entidadeId, 'socios', where('situacao', '==', 'Ativo')), [entidadeId]);
  const lista = dados ? dados.filter((s) => s.nascimento && Number(s.nascimento.slice(5, 7)) === mes)
    .sort((a, b) => a.nascimento.slice(8).localeCompare(b.nascimento.slice(8))) : null;

  function pdf() {
    relatorioPdf({
      entidade, titulo: `Aniversariantes de ${MESES[mes - 1].toLowerCase()}`,
      secoes: [{ colunas: ['Dia', 'Nome', 'Completa', 'Telefone'], linhas: lista.map((s) => [s.nascimento.slice(8), s.nome, `${idade(s.nascimento) + (s.nascimento.slice(5) > hoje().slice(5) ? 1 : 0)} anos`, s.telefone || '']) }],
    });
  }

  return (
    <>
      <div className="filtros">
        <Campo rotulo="Mês"><select value={mes} onChange={(e) => setMes(Number(e.target.value))}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></Campo>
        <div className="acoes" style={{ marginLeft: 'auto' }}>{lista?.length > 0 && <button type="button" className="btn btn-primario" onClick={pdf}><Icone nome="pdf" tam={18} />Baixar PDF</button>}</div>
      </div>
      {erro ? <div className="painel-corpo"><div className="aviso erro">{mensagemErro(erro)}</div></div> : !lista ? <Carregando /> : !lista.length ? <Vazio titulo={`Nenhum aniversariante em ${MESES[mes - 1].toLowerCase()}`} /> : (
        <div className="tabela-wrap">
          <table>
            <thead><tr><th className="num">Dia</th><th>Nome</th><th className="esconder-mobile">Telefone</th></tr></thead>
            <tbody>{lista.map((s) => <tr key={s.id}><td className="num">{s.nascimento.slice(8)}</td><td>{s.nome}<span className="sub">{s.categoria}</span></td><td className="esconder-mobile">{s.telefone || '—'}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
