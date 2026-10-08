import { useMemo, useState } from 'react';
import { where } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useColecao, buscar, emLotes, novoLote, salvar } from '../lib/db';
import { FORMAS_PAGAMENTO } from '../lib/constantes';
import {
  fmtMoeda, fmtData, fmtCompetencia, competenciaAtual, hoje, somarMeses, somar, normalizar, arred, ultimoDiaMes, diasEntre,
} from '../lib/format';
import { reciboMensalidades, relatorioPdf } from '../lib/pdf';
import {
  Abas, Cabecalho, Campo, Carregando, ErroLeitura, ModalForm, Selo, SeletorMes, Vazio, useAcao, useFormulario, useNotificar,
} from '../components/ui';
import Icone from '../components/Icone';
import { valorMensalidadeSocio } from './Socios';

export function statusMensalidade(m) {
  if (m.status === 'pago') return { tipo: 'ok', texto: 'Paga' };
  if (m.status === 'cancelado') return { tipo: 'neutro', texto: 'Cancelada' };
  if (m.vencimento < hoje()) return { tipo: 'atraso', texto: `Atrasada ${diasEntre(m.vencimento, hoje())} dias` };
  return { tipo: 'pendente', texto: 'Em aberto' };
}

function vencimentoDe(comp, dia) {
  const d = Math.min(Number(dia) || 10, Number(ultimoDiaMes(comp).slice(8)));
  return `${comp}-${String(d).padStart(2, '0')}`;
}

export default function Mensalidades() {
  const { entidadeId, entidade, podeEditar, perfil } = useAuth();
  const [aba, setAba] = useState('mes');
  const [comp, setComp] = useState(competenciaAtual());
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [gerar, setGerar] = useState(false);
  const [receber, setReceber] = useState(null);
  const [avulsa, setAvulsa] = useState(false);
  const acao = useAcao();
  const editar = podeEditar('mensalidades');

  const doMes = useColecao(entidadeId, 'mensalidades', aba === 'mes' ? [where('competencia', '==', comp)] : null, `${aba}${comp}`);
  const abertas = useColecao(entidadeId, 'mensalidades', aba === 'atraso' ? [where('status', '==', 'aberto')] : null, aba);

  const base = aba === 'mes' ? doMes : abertas;
  const lista = useMemo(() => {
    let l = base.dados;
    if (aba === 'atraso') l = l.filter((m) => m.vencimento < hoje());
    const b = normalizar(busca);
    if (b) l = l.filter((m) => normalizar(m.socioNome).includes(b));
    if (filtroStatus) l = l.filter((m) => (filtroStatus === 'atraso' ? m.status === 'aberto' && m.vencimento < hoje() : m.status === filtroStatus));
    return [...l].sort((a, b2) => a.socioNome.localeCompare(b2.socioNome) || a.competencia.localeCompare(b2.competencia));
  }, [base.dados, aba, busca, filtroStatus]);

  const validas = doMes.dados.filter((m) => m.status !== 'cancelado');
  const previsto = somar(validas);
  const recebido = somar(validas.filter((m) => m.status === 'pago'), 'valorPago');
  const emAberto = somar(validas.filter((m) => m.status === 'aberto'));
  const pagas = validas.filter((m) => m.status === 'pago').length;

  async function estornar(m) {
    if (!window.confirm(`Estornar o pagamento de ${m.socioNome} (${fmtCompetencia(m.competencia)})? O lançamento também sai do caixa.`)) return;
    await acao(async () => {
      const lote = novoLote();
      lote.atualizar(entidadeId, 'mensalidades', m.id, { status: 'aberto', dataPagamento: null, formaPagamento: null, conta: null, valorPago: null, caixaId: null });
      if (m.caixaId) lote.excluir(entidadeId, 'caixa', m.caixaId);
      await lote.commit();
    }, 'Pagamento estornado');
  }

  async function cancelar(m) {
    const motivo = window.prompt(`Cancelar a mensalidade de ${m.socioNome} (${fmtCompetencia(m.competencia)})? Informe o motivo:`, 'Isenção concedida pela diretoria');
    if (motivo === null) return;
    await acao(() => salvar(entidadeId, 'mensalidades', m.id, { status: 'cancelado', motivoCancelamento: motivo }), 'Mensalidade cancelada');
  }
  async function reabrir(m) {
    await acao(() => salvar(entidadeId, 'mensalidades', m.id, { status: 'aberto', motivoCancelamento: null }), 'Mensalidade reaberta');
  }

  function cobrar(m) {
    const valor = fmtMoeda(m.valor);
    const pix = entidade?.config?.chavePix ? `\n\nChave PIX: ${entidade.config.chavePix}` : '';
    const msg = `Olá, ${m.socioNome.split(' ')[0]}! Tudo bem? Aqui é da tesouraria do ${entidade?.nome}. Consta em aberto a mensalidade de ${fmtCompetencia(m.competencia)}, no valor de ${valor}, vencida em ${fmtData(m.vencimento)}.${pix}\n\nSe já pagou, por favor desconsidere. Obrigado!`;
    const fone = (m.socioTelefone || '').replace(/\D/g, '');
    window.open(`https://wa.me/${fone ? '55' + fone : ''}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  function exportarPdf() {
    const titulo = aba === 'mes' ? `Mensalidades de ${fmtCompetencia(comp)}` : 'Mensalidades em atraso';
    relatorioPdf({
      entidade, titulo,
      resumo: aba === 'mes' ? [['Previsto', fmtMoeda(previsto)], ['Recebido', fmtMoeda(recebido)], ['Em aberto', fmtMoeda(emAberto)]] : [['Total em atraso', fmtMoeda(somar(lista))]],
      secoes: [{
        colunas: ['Sócio', 'Competência', 'Vencimento', 'Valor', 'Situação', 'Pagamento'],
        linhas: lista.map((m) => [m.socioNome, fmtCompetencia(m.competencia), fmtData(m.vencimento), fmtMoeda(m.valorPago ?? m.valor), statusMensalidade(m).texto, m.dataPagamento ? `${fmtData(m.dataPagamento)} (${m.formaPagamento})` : '']),
        alinharDireita: [3],
      }],
    });
  }

  return (
    <>
      <Cabecalho titulo="Mensalidades" descricao="Gere as mensalidades do mês, registre os pagamentos e acompanhe quem está em dia.">
        <button type="button" className="btn" onClick={exportarPdf}><Icone nome="pdf" tam={18} />PDF</button>
        {editar && <button type="button" className="btn" onClick={() => setAvulsa(true)}>Lançar avulsa</button>}
        {editar && <button type="button" className="btn btn-primario" onClick={() => setGerar(true)}><Icone nome="mais" tam={18} />Gerar mensalidades</button>}
      </Cabecalho>

      {aba === 'mes' && (
        <div className="indicadores">
          <div className="indicador"><div className="rotulo">Previsto em {fmtCompetencia(comp)}</div><div className="valor">{fmtMoeda(previsto)}</div><div className="detalhe">{validas.length} mensalidades</div></div>
          <div className="indicador positivo"><div className="rotulo">Recebido</div><div className="valor">{fmtMoeda(recebido)}</div><div className="detalhe">{pagas} pagas</div></div>
          <div className="indicador alerta"><div className="rotulo">Em aberto</div><div className="valor">{fmtMoeda(emAberto)}</div><div className="detalhe">{validas.length - pagas} pendentes</div></div>
          <div className="indicador"><div className="rotulo">Adimplência</div><div className="valor">{validas.length ? Math.round((pagas / validas.length) * 100) : 0}%</div>
            <div className="barra" style={{ marginTop: '.4rem' }}><div style={{ width: `${validas.length ? (pagas / validas.length) * 100 : 0}%` }} /></div></div>
        </div>
      )}

      <div className="painel">
        <Abas ativa={aba} aoTrocar={setAba} abas={[{ id: 'mes', rotulo: 'Por mês' }, { id: 'atraso', rotulo: 'Em atraso (todos os meses)' }]} />
        <div className="filtros">
          {aba === 'mes' && <SeletorMes rotulo="Competência" valor={comp} aoMudar={setComp} />}
          <div className="campo"><label htmlFor="bm">Sócio</label><input id="bm" type="search" placeholder="Buscar pelo nome" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
          {aba === 'mes' && (
            <div className="campo"><label htmlFor="fs">Situação</label>
              <select id="fs" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
                <option value="">Todas</option><option value="aberto">Em aberto</option><option value="atraso">Atrasadas</option><option value="pago">Pagas</option><option value="cancelado">Canceladas</option>
              </select>
            </div>
          )}
          {aba === 'mes' && (
            <div className="acoes" style={{ marginLeft: 'auto' }}>
              <button type="button" className="btn btn-peq" onClick={() => setComp(somarMeses(comp, -1))} aria-label="Mês anterior">‹ Anterior</button>
              <button type="button" className="btn btn-peq" onClick={() => setComp(somarMeses(comp, 1))} aria-label="Próximo mês">Próximo ›</button>
            </div>
          )}
        </div>
        <ErroLeitura erro={base.erro} />
        {base.carregando ? <Carregando /> : lista.length === 0 ? (
          <Vazio titulo={aba === 'atraso' ? 'Nenhuma mensalidade em atraso. Tropa em dia!' : `Nenhuma mensalidade em ${fmtCompetencia(comp)}`}>
            {aba === 'mes' && editar && !doMes.dados.length && <button type="button" className="btn btn-primario" onClick={() => setGerar(true)}>Gerar mensalidades de {fmtCompetencia(comp)}</button>}
          </Vazio>
        ) : (
          <div className="tabela-wrap">
            <table>
              <thead><tr><th>Sócio</th>{aba === 'atraso' && <th>Competência</th>}<th className="esconder-mobile">Vencimento</th><th className="num">Valor</th><th>Situação</th><th /></tr></thead>
              <tbody>
                {lista.map((m) => {
                  const st = statusMensalidade(m);
                  return (
                    <tr key={m.id}>
                      <td><strong>{m.socioNome}</strong>{m.status === 'pago' && <span className="sub">Pago em {fmtData(m.dataPagamento)}, {m.formaPagamento}</span>}{m.status === 'cancelado' && <span className="sub">{m.motivoCancelamento}</span>}</td>
                      {aba === 'atraso' && <td>{fmtCompetencia(m.competencia)}</td>}
                      <td className="esconder-mobile">{fmtData(m.vencimento)}</td>
                      <td className="num">{fmtMoeda(m.valorPago ?? m.valor)}</td>
                      <td><Selo tipo={st.tipo}>{st.texto}</Selo></td>
                      <td className="acoes-celula">
                        {m.status === 'aberto' && editar && <button type="button" className="btn btn-ok btn-peq" onClick={() => setReceber(m)}>Receber</button>}{' '}
                        {m.status === 'aberto' && m.vencimento < hoje() && <button type="button" className="btn btn-peq" onClick={() => cobrar(m)}>Cobrar</button>}{' '}
                        {m.status === 'aberto' && editar && <button type="button" className="btn-link" onClick={() => cancelar(m)}>Cancelar</button>}
                        {m.status === 'pago' && <button type="button" className="btn btn-peq" onClick={() => reciboMensalidades(entidade, null, [m], perfil?.nome)}>Recibo</button>}{' '}
                        {m.status === 'pago' && editar && <button type="button" className="btn-link" onClick={() => estornar(m)}>Estornar</button>}
                        {m.status === 'cancelado' && editar && <button type="button" className="btn-link" onClick={() => reabrir(m)}>Reabrir</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {aba === 'atraso' && <tfoot><tr><td colSpan={3}>Total em atraso ({lista.length})</td><td className="num">{fmtMoeda(somar(lista))}</td><td colSpan={2} /></tr></tfoot>}
            </table>
          </div>
        )}
      </div>

      {gerar && <GerarMensalidades compInicial={comp} aoFechar={() => setGerar(false)} />}
      {receber && <ReceberMensalidades inicial={receber} aoFechar={() => setReceber(null)} />}
      {avulsa && <MensalidadeAvulsa comp={comp} aoFechar={() => setAvulsa(false)} />}
    </>
  );
}

function GerarMensalidades({ compInicial, aoFechar }) {
  const { entidadeId, config } = useAuth();
  const notificar = useNotificar();
  const { dados, ligar } = useFormulario({ inicio: compInicial, meses: 1, dia: config.diaVencimento || 10 });

  async function gerar() {
    const socios = (await buscar(entidadeId, 'socios', where('situacao', '==', 'Ativo')))
      .filter((s) => !s.isento && valorMensalidadeSocio(s, config) > 0);
    const comps = Array.from({ length: Math.max(1, Math.min(12, Number(dados.meses) || 1)) }, (_, i) => somarMeses(dados.inicio, i));
    const existentes = await buscar(entidadeId, 'mensalidades', where('competencia', 'in', comps));
    const ja = new Set(existentes.map((m) => `${m.socioId}|${m.competencia}`));
    const novas = [];
    comps.forEach((c) => socios.forEach((s) => {
      if (!ja.has(`${s.id}|${c}`)) {
        novas.push({
          socioId: s.id, socioNome: s.nome, socioTelefone: s.telefone || '', categoria: s.categoria,
          competencia: c, vencimento: vencimentoDe(c, dados.dia), valor: arred(valorMensalidadeSocio(s, config)), status: 'aberto',
        });
      }
    }));
    if (!novas.length) { notificar('Todas as mensalidades desse período já estavam geradas.'); return true; }
    if (!window.confirm(`Gerar ${novas.length} mensalidade(s) para ${socios.length} sócio(s) ativo(s), somando ${fmtMoeda(somar(novas))}?`)) return false;
    await emLotes(novas, (lote, m) => lote.criar(entidadeId, 'mensalidades', m));
    notificar(`${novas.length} mensalidade(s) gerada(s)`);
    return true;
  }

  return (
    <ModalForm titulo="Gerar mensalidades" aoFechar={aoFechar} aoSalvar={gerar} textoSalvar="Gerar">
      <p>Cria uma mensalidade para cada sócio <strong>ativo</strong> e não isento, com o valor da categoria (ou o valor próprio do cadastro). Quem já tem mensalidade no mês é pulado, então pode gerar de novo sem duplicar.</p>
      <div className="form-grade-3">
        <Campo rotulo="A partir de"><input type="month" {...ligar('inicio', { obrigatorio: true })} /></Campo>
        <Campo rotulo="Quantos meses" ajuda="Até 12"><input type="number" min="1" max="12" {...ligar('meses', { numero: true })} /></Campo>
        <Campo rotulo="Dia do vencimento"><input type="number" min="1" max="31" {...ligar('dia', { numero: true })} /></Campo>
      </div>
    </ModalForm>
  );
}

export function ReceberMensalidades({ inicial, aoFechar }) {
  const { entidadeId, entidade, config, perfil } = useAuth();
  const acao = useAcao();
  const abertas = useColecao(entidadeId, 'mensalidades', [where('socioId', '==', inicial.socioId), where('status', '==', 'aberto')], inicial.socioId);
  const [marcadas, setMarcadas] = useState({ [inicial.id]: true });
  const [ajustes, setAjustes] = useState({});
  const { dados, ligar } = useFormulario({ data: hoje(), forma: 'PIX', conta: config.contasFinanceiras[0], recibo: true });
  const lista = [...abertas.dados].sort((a, b) => a.competencia.localeCompare(b.competencia));
  const selecionadas = lista.filter((m) => marcadas[m.id]);
  const valorDe = (m) => (ajustes[m.id] !== undefined && ajustes[m.id] !== '' ? Number(ajustes[m.id]) : Number(m.valor));
  const total = arred(selecionadas.reduce((s, m) => s + valorDe(m), 0));

  async function confirmar() {
    if (!selecionadas.length) throw new Error('Marque ao menos uma mensalidade.');
    const pagas = [];
    const ok = await acao(async () => {
      const lote = novoLote();
      selecionadas.forEach((m) => {
        const valorPago = arred(valorDe(m));
        const caixaId = lote.criar(entidadeId, 'caixa', {
          data: dados.data, tipo: 'entrada', valor: valorPago, categoria: 'Mensalidades',
          descricao: `Mensalidade ${fmtCompetencia(m.competencia)} — ${m.socioNome}`,
          conta: dados.conta, forma: dados.forma, origem: 'mensalidade', refId: m.id, socioId: m.socioId,
        });
        lote.atualizar(entidadeId, 'mensalidades', m.id, {
          status: 'pago', dataPagamento: dados.data, formaPagamento: dados.forma, conta: dados.conta, valorPago, caixaId,
        });
        pagas.push({ ...m, valorPago, dataPagamento: dados.data, formaPagamento: dados.forma });
      });
      await lote.commit();
    }, selecionadas.length > 1 ? `${selecionadas.length} mensalidades recebidas` : 'Pagamento registrado');
    if (ok && dados.recibo) reciboMensalidades(entidade, null, pagas, perfil?.nome);
    return ok;
  }

  return (
    <ModalForm largo titulo={`Receber de ${inicial.socioNome}`} aoFechar={aoFechar} aoSalvar={confirmar} textoSalvar={`Confirmar ${fmtMoeda(total)}`}>
      {abertas.carregando ? <Carregando /> : (
        <>
          <p>Marque as mensalidades que estão sendo pagas agora. Para desconto ou juros, ajuste o valor.</p>
          <div className="tabela-wrap" style={{ border: '1px solid var(--linha)', borderRadius: 6, marginBottom: '1rem' }}>
            <table>
              <thead><tr><th style={{ width: 40 }} /><th>Competência</th><th>Vencimento</th><th className="num">Valor</th><th className="num" style={{ width: 150 }}>Valor pago</th></tr></thead>
              <tbody>
                {lista.map((m) => (
                  <tr key={m.id}>
                    <td><input type="checkbox" aria-label={`Pagar ${fmtCompetencia(m.competencia)}`} checked={Boolean(marcadas[m.id])} onChange={(e) => setMarcadas({ ...marcadas, [m.id]: e.target.checked })} /></td>
                    <td>{fmtCompetencia(m.competencia)}</td>
                    <td>{fmtData(m.vencimento)} {m.vencimento < hoje() && <Selo tipo="atraso">atrasada</Selo>}</td>
                    <td className="num">{fmtMoeda(m.valor)}</td>
                    <td className="num"><input type="number" step="0.01" min="0" style={{ textAlign: 'right' }} placeholder={Number(m.valor).toFixed(2)} value={ajustes[m.id] ?? ''} onChange={(e) => setAjustes({ ...ajustes, [m.id]: e.target.value })} disabled={!marcadas[m.id]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="form-grade-3">
            <Campo rotulo="Data do pagamento"><input type="date" {...ligar('data', { obrigatorio: true })} /></Campo>
            <Campo rotulo="Forma"><select {...ligar('forma')}>{FORMAS_PAGAMENTO.map((f) => <option key={f}>{f}</option>)}</select></Campo>
            <Campo rotulo="Entrou em"><select {...ligar('conta')}>{config.contasFinanceiras.map((c) => <option key={c}>{c}</option>)}</select></Campo>
          </div>
          <label className="checkbox"><input type="checkbox" checked={dados.recibo} onChange={ligar('recibo').onChange} />Baixar o recibo em PDF ao confirmar</label>
        </>
      )}
    </ModalForm>
  );
}

function MensalidadeAvulsa({ comp, aoFechar }) {
  const { entidadeId, config } = useAuth();
  const acao = useAcao();
  const socios = useColecao(entidadeId, 'socios', [where('situacao', '==', 'Ativo')]);
  const { dados, ligar, definir } = useFormulario({ socioId: '', competencia: comp, vencimento: vencimentoDe(comp, config.diaVencimento), valor: '' });
  const ordenados = [...socios.dados].sort((a, b) => a.nome.localeCompare(b.nome));

  function escolher(e) {
    const s = socios.dados.find((x) => x.id === e.target.value);
    definir('socioId', e.target.value);
    if (s) definir('valor', valorMensalidadeSocio(s, config));
  }

  async function gravar() {
    const s = socios.dados.find((x) => x.id === dados.socioId);
    if (!s) throw new Error('Escolha o sócio.');
    const ja = await buscar(entidadeId, 'mensalidades', where('socioId', '==', s.id), where('competencia', '==', dados.competencia));
    if (ja.length && !window.confirm(`${s.nome} já tem mensalidade em ${fmtCompetencia(dados.competencia)}. Lançar outra mesmo assim?`)) return false;
    return acao(() => salvar(entidadeId, 'mensalidades', null, {
      socioId: s.id, socioNome: s.nome, socioTelefone: s.telefone || '', categoria: s.categoria,
      competencia: dados.competencia, vencimento: dados.vencimento, valor: arred(dados.valor), status: 'aberto',
    }), 'Mensalidade lançada');
  }

  return (
    <ModalForm titulo="Lançar mensalidade avulsa" aoFechar={aoFechar} aoSalvar={gravar}>
      <div className="form-grade">
        <Campo rotulo="Sócio" className="col-2">
          <select value={dados.socioId} onChange={escolher} required>
            <option value="">Escolha…</option>
            {ordenados.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Competência"><input type="month" {...ligar('competencia', { obrigatorio: true })} /></Campo>
        <Campo rotulo="Vencimento"><input type="date" {...ligar('vencimento', { obrigatorio: true })} /></Campo>
        <Campo rotulo="Valor (R$)"><input type="number" step="0.01" min="0" {...ligar('valor', { obrigatorio: true })} /></Campo>
      </div>
    </ModalForm>
  );
}
