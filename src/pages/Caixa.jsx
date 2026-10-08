import { useEffect, useMemo, useState } from 'react';
import { orderBy, where } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useColecao, salvar, excluir, novoLote } from '../lib/db';
import { FORMAS_PAGAMENTO } from '../lib/constantes';
import { fmtMoeda, fmtData, competenciaAtual, hoje, somar, arred, fmtCompetencia, ultimoDiaMes, normalizar } from '../lib/format';
import { saldosAntesDe, CATEGORIA_TRANSFERENCIA } from '../lib/saldos';
import { relatorioPdf } from '../lib/pdf';
import {
  Cabecalho, Campo, Carregando, ErroLeitura, ModalForm, Selo, SeletorMes, Vazio, useAcao, useFormulario,
} from '../components/ui';
import Icone from '../components/Icone';

const ORIGENS = { mensalidade: 'Mensalidade', conta: 'Conta', transferencia: 'Transferência', manual: 'Manual', evento: 'Evento' };

export default function Caixa() {
  const { entidadeId, entidade, config, podeEditar } = useAuth();
  const [comp, setComp] = useState(competenciaAtual());
  const [contaFiltro, setContaFiltro] = useState('');
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState(null);
  const [transferir, setTransferir] = useState(false);
  const [saldoAnt, setSaldoAnt] = useState(null);
  const acao = useAcao();
  const editar = podeEditar('caixa');
  const inicio = `${comp}-01`;
  const fim = ultimoDiaMes(comp);

  const { dados, carregando, erro } = useColecao(entidadeId, 'caixa',
    [where('data', '>=', inicio), where('data', '<=', fim), orderBy('data')], comp);

  const contasCfg = config.contasFinanceiras;
  const chaveContas = contasCfg.join('|');
  useEffect(() => {
    let vivo = true;
    setSaldoAnt(null);
    saldosAntesDe(entidadeId, contasCfg, inicio)
      .then((s) => vivo && setSaldoAnt(s))
      .catch((e) => { console.error(e); if (vivo) setSaldoAnt({ erro: true }); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entidadeId, inicio, chaveContas, dados.length]);

  const movs = useMemo(() => {
    const b = normalizar(busca);
    return dados
      .filter((m) => (!contaFiltro || m.conta === contaFiltro) && (!b || normalizar(`${m.descricao} ${m.categoria}`).includes(b)))
      .sort((a, b2) => a.data.localeCompare(b2.data) || (a.criadoEm?.seconds || 0) - (b2.criadoEm?.seconds || 0));
  }, [dados, contaFiltro, busca]);

  const saldoInicial = saldoAnt && !saldoAnt.erro
    ? arred(contaFiltro ? (saldoAnt[contaFiltro] || 0) : Object.values(saldoAnt).reduce((s, v) => s + v, 0))
    : null;
  const doFiltro = dados.filter((m) => !contaFiltro || m.conta === contaFiltro);
  const entradas = somar(doFiltro.filter((m) => m.tipo === 'entrada'));
  const saidas = somar(doFiltro.filter((m) => m.tipo === 'saida'));
  const saldoFinal = saldoInicial == null ? null : arred(saldoInicial + entradas - saidas);

  let acumulado = saldoInicial ?? 0;
  const linhas = movs.map((m) => {
    acumulado = arred(acumulado + (m.tipo === 'entrada' ? m.valor : -m.valor));
    return { ...m, acumulado };
  });

  const porConta = contasCfg.map((c) => {
    const ini = saldoAnt?.[c] || 0;
    const mv = dados.filter((m) => m.conta === c);
    return { conta: c, saldo: arred(ini + somar(mv.filter((m) => m.tipo === 'entrada')) - somar(mv.filter((m) => m.tipo === 'saida'))) };
  });

  async function remover(m) {
    if (m.grupo) {
      if (!window.confirm('Excluir esta transferência (as duas pontas)?')) return;
      const par = dados.filter((x) => x.grupo === m.grupo);
      await acao(async () => { const l = novoLote(); par.forEach((x) => l.excluir(entidadeId, 'caixa', x.id)); await l.commit(); }, 'Transferência excluída');
      return;
    }
    if (!window.confirm(`Excluir o lançamento "${m.descricao}"?`)) return;
    await acao(() => excluir(entidadeId, 'caixa', m.id), 'Lançamento excluído');
  }

  function exportarPdf() {
    relatorioPdf({
      entidade, titulo: `Livro caixa — ${fmtCompetencia(comp)}`, subtitulo: contaFiltro ? `Conta: ${contaFiltro}` : 'Todas as contas',
      resumo: [['Saldo anterior', fmtMoeda(saldoInicial)], ['Entradas', fmtMoeda(entradas)], ['Saídas', fmtMoeda(saidas)], ['Saldo final', fmtMoeda(saldoFinal)]],
      secoes: [{
        colunas: ['Data', 'Descrição', 'Categoria', 'Conta', 'Entrada', 'Saída', 'Saldo'],
        linhas: linhas.map((m) => [fmtData(m.data), m.descricao, m.categoria, m.conta, m.tipo === 'entrada' ? fmtMoeda(m.valor) : '', m.tipo === 'saida' ? fmtMoeda(m.valor) : '', fmtMoeda(m.acumulado)]),
        rodape: ['', 'Totais do período', '', '', fmtMoeda(entradas), fmtMoeda(saidas), fmtMoeda(saldoFinal)],
        alinharDireita: [4, 5, 6],
      }],
      paisagem: true,
    });
  }

  return (
    <>
      <Cabecalho titulo="Caixa" descricao="Livro caixa: tudo que entrou e saiu, com saldo por conta. Mensalidades e contas baixadas aparecem aqui sozinhas.">
        <button type="button" className="btn" onClick={exportarPdf}><Icone nome="pdf" tam={18} />Livro caixa</button>
        {editar && contasCfg.length > 1 && <button type="button" className="btn" onClick={() => setTransferir(true)}>Transferir entre contas</button>}
        {editar && <button type="button" className="btn btn-ok" onClick={() => setEditando({ tipo: 'entrada' })}>+ Entrada</button>}
        {editar && <button type="button" className="btn btn-primario" onClick={() => setEditando({ tipo: 'saida' })}>− Saída</button>}
      </Cabecalho>

      {saldoAnt?.erro && <div className="aviso">Não foi possível calcular o saldo anterior. Se acabou de instalar, publique os índices do Firestore (<code>firebase deploy --only firestore:indexes</code>) e aguarde alguns minutos.</div>}

      <div className="indicadores">
        <div className="indicador"><div className="rotulo">Saldo no início do mês</div><div className="valor">{saldoInicial == null ? '…' : fmtMoeda(saldoInicial)}</div></div>
        <div className="indicador positivo"><div className="rotulo">Entradas</div><div className="valor">{fmtMoeda(entradas)}</div></div>
        <div className="indicador alerta"><div className="rotulo">Saídas</div><div className="valor">{fmtMoeda(saidas)}</div></div>
        <div className="indicador"><div className="rotulo">Saldo no fim do mês</div><div className="valor" style={{ color: saldoFinal < 0 ? 'var(--lenco)' : undefined }}>{saldoFinal == null ? '…' : fmtMoeda(saldoFinal)}</div>
          {!contaFiltro && saldoAnt && !saldoAnt.erro && <div className="detalhe">{porConta.map((p) => `${p.conta}: ${fmtMoeda(p.saldo)}`).join('  |  ')}</div>}
        </div>
      </div>

      <div className="painel">
        <div className="filtros">
          <SeletorMes valor={comp} aoMudar={setComp} />
          <div className="campo"><label htmlFor="cf">Conta</label>
            <select id="cf" value={contaFiltro} onChange={(e) => setContaFiltro(e.target.value)}>
              <option value="">Todas</option>{contasCfg.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="campo"><label htmlFor="bcx">Buscar</label><input id="bcx" type="search" placeholder="Descrição ou categoria" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        </div>
        <ErroLeitura erro={erro} />
        {carregando ? <Carregando /> : linhas.length === 0 ? (
          <Vazio titulo={`Nenhum movimento em ${fmtCompetencia(comp)}`}>Os recebimentos de mensalidades e as contas baixadas entram aqui automaticamente.</Vazio>
        ) : (
          <div className="tabela-wrap">
            <table>
              <thead><tr><th>Data</th><th>Descrição</th><th className="esconder-mobile">Categoria</th><th className="esconder-mobile">Conta</th><th className="num">Valor</th><th className="num esconder-mobile">Saldo</th><th /></tr></thead>
              <tbody>
                {linhas.map((m) => (
                  <tr key={m.id}>
                    <td>{fmtData(m.data)}</td>
                    <td>{m.descricao}<span className="sub">{[ORIGENS[m.origem] || 'Manual', m.forma, m.eventoNome && `Evento: ${m.eventoNome}`].filter(Boolean).join(', ')}</span></td>
                    <td className="esconder-mobile">{m.categoria}</td>
                    <td className="esconder-mobile">{m.conta}</td>
                    <td className={`num ${m.tipo}`}>{m.tipo === 'entrada' ? '+' : '−'} {fmtMoeda(m.valor)}</td>
                    <td className="num esconder-mobile">{saldoInicial == null && !contaFiltro ? '' : fmtMoeda(m.acumulado)}</td>
                    <td className="acoes-celula">
                      {editar && (!m.origem || m.origem === 'manual' || m.origem === 'evento') && <><button type="button" className="btn-link" onClick={() => setEditando(m)}>Editar</button>{' '}</>}
                      {editar && (!m.origem || ['manual', 'evento', 'transferencia'].includes(m.origem)) && <button type="button" className="btn-link" onClick={() => remover(m)}>Excluir</button>}
                      {(m.origem === 'mensalidade' || m.origem === 'conta') && <span className="sub" title="Para desfazer, use Estornar na tela de origem">automático</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editando && <FormMovimento mov={editando} aoFechar={() => setEditando(null)} />}
      {transferir && <Transferencia aoFechar={() => setTransferir(false)} />}
    </>
  );
}

export function FormMovimento({ mov, aoFechar, evento }) {
  const { entidadeId, config } = useAuth();
  const acao = useAcao();
  const eventos = useColecao(entidadeId, 'eventos', [orderBy('data', 'desc')]);
  const novo = !mov.id;
  const { dados, ligar } = useFormulario({
    data: hoje(), forma: 'Dinheiro', conta: config.contasFinanceiras[0], valor: '',
    eventoId: evento?.id || '', ...mov,
  });
  const entrada = dados.tipo === 'entrada';
  const categorias = entrada ? config.categoriasReceita : config.categoriasDespesa;

  function gravar() {
    const ev = eventos.dados.find((e) => e.id === dados.eventoId) || (evento?.id === dados.eventoId ? evento : null);
    return acao(() => salvar(entidadeId, 'caixa', mov.id, {
      data: dados.data, tipo: dados.tipo, valor: arred(dados.valor), descricao: dados.descricao.trim(),
      categoria: categorias.includes(dados.categoria) ? dados.categoria : categorias[0],
      conta: dados.conta, forma: dados.forma, observacoes: dados.observacoes || '',
      eventoId: dados.eventoId || null, eventoNome: ev?.nome || null,
      origem: dados.eventoId ? 'evento' : 'manual',
    }), novo ? 'Lançamento registrado' : 'Lançamento atualizado');
  }

  return (
    <ModalForm titulo={`${novo ? 'Nova' : 'Editar'} ${entrada ? 'entrada' : 'saída'} de caixa`} aoFechar={aoFechar} aoSalvar={gravar}>
      <div className="form-grade">
        <Campo rotulo="Descrição" className="col-2"><input placeholder={entrada ? 'Venda de fichas da copa' : 'Compra de gelo para o baile'} {...ligar('descricao', { obrigatorio: true })} autoFocus /></Campo>
        <Campo rotulo="Valor (R$)"><input type="number" step="0.01" min="0.01" {...ligar('valor', { obrigatorio: true })} /></Campo>
        <Campo rotulo="Data"><input type="date" {...ligar('data', { obrigatorio: true })} /></Campo>
        <Campo rotulo="Categoria"><select {...ligar('categoria')}>{categorias.map((c) => <option key={c}>{c}</option>)}</select></Campo>
        <Campo rotulo={entrada ? 'Entrou em' : 'Saiu de'}><select {...ligar('conta')}>{config.contasFinanceiras.map((c) => <option key={c}>{c}</option>)}</select></Campo>
        <Campo rotulo="Forma"><select {...ligar('forma')}>{FORMAS_PAGAMENTO.map((f) => <option key={f}>{f}</option>)}</select></Campo>
        <Campo rotulo="Evento relacionado">
          <select {...ligar('eventoId')}>
            <option value="">Nenhum</option>
            {evento && !eventos.dados.some((e) => e.id === evento.id) && <option value={evento.id}>{evento.nome}</option>}
            {eventos.dados.map((e) => <option key={e.id} value={e.id}>{e.nome} — {fmtData(e.data)}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Observações" className="col-2"><textarea {...ligar('observacoes')} /></Campo>
      </div>
    </ModalForm>
  );
}

function Transferencia({ aoFechar }) {
  const { entidadeId, config } = useAuth();
  const acao = useAcao();
  const cs = config.contasFinanceiras;
  const { dados, ligar } = useFormulario({ de: cs[0], para: cs[1], valor: '', data: hoje(), descricao: 'Depósito do caixa no banco' });

  function gravar() {
    if (dados.de === dados.para) throw new Error('Escolha contas diferentes para origem e destino.');
    return acao(async () => {
      const l = novoLote();
      const grupo = `t${Date.now()}`;
      const base = { data: dados.data, valor: arred(dados.valor), categoria: CATEGORIA_TRANSFERENCIA, origem: 'transferencia', grupo, forma: 'Transferência' };
      l.criar(entidadeId, 'caixa', { ...base, tipo: 'saida', conta: dados.de, descricao: `${dados.descricao} (para ${dados.para})` });
      l.criar(entidadeId, 'caixa', { ...base, tipo: 'entrada', conta: dados.para, descricao: `${dados.descricao} (de ${dados.de})` });
      await l.commit();
    }, 'Transferência registrada');
  }

  return (
    <ModalForm titulo="Transferir entre contas" aoFechar={aoFechar} aoSalvar={gravar} textoSalvar="Transferir">
      <p>Use para depósitos e saques: o dinheiro sai de uma conta e entra na outra, sem contar como receita ou despesa.</p>
      <div className="form-grade">
        <Campo rotulo="De"><select {...ligar('de')}>{cs.map((c) => <option key={c}>{c}</option>)}</select></Campo>
        <Campo rotulo="Para"><select {...ligar('para')}>{cs.map((c) => <option key={c}>{c}</option>)}</select></Campo>
        <Campo rotulo="Valor (R$)"><input type="number" step="0.01" min="0.01" {...ligar('valor', { obrigatorio: true })} /></Campo>
        <Campo rotulo="Data"><input type="date" {...ligar('data', { obrigatorio: true })} /></Campo>
        <Campo rotulo="Descrição" className="col-2"><input {...ligar('descricao', { obrigatorio: true })} /></Campo>
      </div>
    </ModalForm>
  );
}

