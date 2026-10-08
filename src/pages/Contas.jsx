import { useMemo, useState } from 'react';
import { orderBy, where } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useColecao, salvar, excluir, novoLote, emLotes } from '../lib/db';
import { FORMAS_PAGAMENTO } from '../lib/constantes';
import { fmtMoeda, fmtData, competenciaAtual, hoje, somar, somarMeses, normalizar, arred, fmtCompetencia, ultimoDiaMes, diasEntre } from '../lib/format';
import { relatorioPdf, reciboPdf } from '../lib/pdf';
import {
  Abas, Cabecalho, Campo, Carregando, ErroLeitura, ModalForm, Selo, SeletorMes, Vazio, useAcao, useFormulario,
} from '../components/ui';
import Icone from '../components/Icone';

export function statusConta(c) {
  if (c.status === 'pago') return { tipo: 'ok', texto: c.tipo === 'pagar' ? 'Paga' : 'Recebida' };
  if (c.vencimento < hoje()) return { tipo: 'atraso', texto: `Vencida há ${diasEntre(c.vencimento, hoje())} dias` };
  if (c.vencimento === hoje()) return { tipo: 'pendente', texto: 'Vence hoje' };
  return { tipo: 'pendente', texto: 'Em aberto' };
}

export default function Contas() {
  const { entidadeId, entidade, podeEditar, perfil } = useAuth();
  const [tipo, setTipo] = useState('pagar');
  const [modo, setModo] = useState('abertas');
  const [comp, setComp] = useState(competenciaAtual());
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState(null);
  const [baixando, setBaixando] = useState(null);
  const acao = useAcao();
  const editar = podeEditar('contas');

  const restricoes = modo === 'abertas'
    ? [where('status', '==', 'aberto')]
    : [where('vencimento', '>=', `${comp}-01`), where('vencimento', '<=', ultimoDiaMes(comp)), orderBy('vencimento')];
  const { dados, carregando, erro } = useColecao(entidadeId, 'contas', restricoes, `${modo}${comp}`);

  const doTipo = dados.filter((c) => c.tipo === tipo);
  const lista = useMemo(() => {
    const b = normalizar(busca);
    return doTipo.filter((c) => !b || normalizar(`${c.descricao} ${c.pessoa} ${c.categoria}`).includes(b))
      .sort((a, b2) => a.vencimento.localeCompare(b2.vencimento));
  }, [doTipo, busca]);

  const abertas = doTipo.filter((c) => c.status === 'aberto');
  const vencidas = abertas.filter((c) => c.vencimento < hoje());
  const proximos7 = abertas.filter((c) => c.vencimento >= hoje() && diasEntre(hoje(), c.vencimento) <= 7);
  const rotulo = tipo === 'pagar' ? 'a pagar' : 'a receber';

  async function estornar(c) {
    if (!window.confirm(`Estornar a baixa de "${c.descricao}"? O lançamento também sai do caixa.`)) return;
    await acao(async () => {
      const lote = novoLote();
      lote.atualizar(entidadeId, 'contas', c.id, { status: 'aberto', dataPagamento: null, forma: null, conta: null, valorPago: null, caixaId: null });
      if (c.caixaId) lote.excluir(entidadeId, 'caixa', c.caixaId);
      await lote.commit();
    }, 'Baixa estornada');
  }

  function exportarPdf() {
    relatorioPdf({
      entidade,
      titulo: `Contas ${rotulo}`,
      subtitulo: modo === 'abertas' ? 'Todas em aberto' : `Vencimento em ${fmtCompetencia(comp)}`,
      resumo: [['Em aberto', fmtMoeda(somar(abertas))], ['Vencidas', fmtMoeda(somar(vencidas))]],
      secoes: [{
        colunas: ['Vencimento', 'Descrição', tipo === 'pagar' ? 'Fornecedor' : 'Pagador', 'Categoria', 'Valor', 'Situação'],
        linhas: lista.map((c) => [fmtData(c.vencimento), c.descricao + (c.parcela ? ` (${c.parcela})` : ''), c.pessoa || '', c.categoria, fmtMoeda(c.valorPago ?? c.valor), statusConta(c).texto]),
        rodape: ['', 'Total', '', '', fmtMoeda(somar(lista)), ''],
        alinharDireita: [4],
      }],
    });
  }

  return (
    <>
      <Cabecalho titulo="Contas a pagar e receber" descricao="Compromissos com vencimento: luz, conjunto, patrocínios, aluguéis do galpão. Ao dar baixa, o valor entra ou sai do caixa.">
        <button type="button" className="btn" onClick={exportarPdf}><Icone nome="pdf" tam={18} />PDF</button>
        {editar && <button type="button" className="btn btn-primario" onClick={() => setEditando({ tipo })}><Icone nome="mais" tam={18} />Nova conta {rotulo}</button>}
      </Cabecalho>

      <div className="indicadores">
        <div className="indicador"><div className="rotulo">Total {rotulo} {modo === 'mes' ? `em ${fmtCompetencia(comp)}` : 'em aberto'}</div><div className="valor">{fmtMoeda(somar(abertas))}</div><div className="detalhe">{abertas.length} conta(s)</div></div>
        <div className={`indicador ${vencidas.length ? 'alerta' : ''}`}><div className="rotulo">Vencidas</div><div className="valor">{fmtMoeda(somar(vencidas))}</div><div className="detalhe">{vencidas.length} conta(s)</div></div>
        <div className="indicador"><div className="rotulo">Vencem nos próximos 7 dias</div><div className="valor">{fmtMoeda(somar(proximos7))}</div><div className="detalhe">{proximos7.length} conta(s)</div></div>
      </div>

      <div className="painel">
        <Abas ativa={tipo} aoTrocar={setTipo} abas={[
          { id: 'pagar', rotulo: 'A pagar', contagem: dados.filter((c) => c.tipo === 'pagar' && c.status === 'aberto').length },
          { id: 'receber', rotulo: 'A receber', contagem: dados.filter((c) => c.tipo === 'receber' && c.status === 'aberto').length },
        ]} />
        <div className="filtros">
          <div className="campo"><label htmlFor="mc">Mostrar</label>
            <select id="mc" value={modo} onChange={(e) => setModo(e.target.value)}>
              <option value="abertas">Todas em aberto</option><option value="mes">Por mês de vencimento</option>
            </select>
          </div>
          {modo === 'mes' && <SeletorMes valor={comp} aoMudar={setComp} />}
          <div className="campo"><label htmlFor="bc">Buscar</label><input id="bc" type="search" placeholder="Descrição, fornecedor ou categoria" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        </div>
        <ErroLeitura erro={erro} />
        {carregando ? <Carregando /> : lista.length === 0 ? (
          <Vazio titulo={modo === 'abertas' ? `Nenhuma conta ${rotulo} em aberto` : `Nenhuma conta ${rotulo} vencendo em ${fmtCompetencia(comp)}`}>
            {editar && <button type="button" className="btn btn-primario" onClick={() => setEditando({ tipo })}>Lançar conta {rotulo}</button>}
          </Vazio>
        ) : (
          <div className="tabela-wrap">
            <table>
              <thead><tr><th>Vencimento</th><th>Descrição</th><th className="esconder-mobile">Categoria</th><th className="num">Valor</th><th>Situação</th><th /></tr></thead>
              <tbody>
                {lista.map((c) => {
                  const st = statusConta(c);
                  return (
                    <tr key={c.id}>
                      <td>{fmtData(c.vencimento)}</td>
                      <td><strong>{c.descricao}</strong>{c.parcela && <> <Selo>{c.parcela}</Selo></>}
                        <span className="sub">{[c.pessoa, c.eventoNome && `Evento: ${c.eventoNome}`, c.status === 'pago' && `${tipo === 'pagar' ? 'Paga' : 'Recebida'} em ${fmtData(c.dataPagamento)} (${c.forma})`].filter(Boolean).join(' — ')}</span></td>
                      <td className="esconder-mobile">{c.categoria}</td>
                      <td className="num">{fmtMoeda(c.valorPago ?? c.valor)}</td>
                      <td><Selo tipo={st.tipo}>{st.texto}</Selo></td>
                      <td className="acoes-celula">
                        {c.status === 'aberto' && editar && <><button type="button" className="btn btn-ok btn-peq" onClick={() => setBaixando(c)}>{tipo === 'pagar' ? 'Pagar' : 'Receber'}</button>{' '}
                          <button type="button" className="btn-link" onClick={() => setEditando(c)}>Editar</button></>}
                        {c.status === 'pago' && tipo === 'receber' && <button type="button" className="btn btn-peq" onClick={() => reciboPdf({ entidade, pagador: c.pessoa || '—', valor: c.valorPago ?? c.valor, referente: c.descricao, data: c.dataPagamento, forma: c.forma, recebidoPor: perfil?.nome })}>Recibo</button>}{' '}
                        {c.status === 'pago' && editar && <button type="button" className="btn-link" onClick={() => estornar(c)}>Estornar</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr><td colSpan={3}>Total</td><td className="num">{fmtMoeda(lista.reduce((s, c) => s + Number(c.valorPago ?? c.valor), 0))}</td><td colSpan={2} /></tr></tfoot>
            </table>
          </div>
        )}
      </div>

      {editando && <FormConta conta={editando} aoFechar={() => setEditando(null)} />}
      {baixando && <BaixarConta conta={baixando} aoFechar={() => setBaixando(null)} />}
    </>
  );
}

export function FormConta({ conta, aoFechar, evento }) {
  const { entidadeId, config } = useAuth();
  const acao = useAcao();
  const novo = !conta.id;
  const eventos = useColecao(entidadeId, 'eventos', [orderBy('data', 'desc')]);
  const { dados, ligar } = useFormulario({
    tipo: 'pagar', vencimento: hoje(), parcelas: 1, valor: '',
    eventoId: evento?.id || '', ...conta,
  });
  const categorias = dados.tipo === 'pagar' ? config.categoriasDespesa : config.categoriasReceita;

  async function gravar() {
    const ev = eventos.dados.find((e) => e.id === dados.eventoId);
    const base = {
      tipo: dados.tipo, descricao: dados.descricao.trim(), pessoa: dados.pessoa || '', categoria: categorias.includes(dados.categoria) ? dados.categoria : categorias[0],
      documento: dados.documento || '', observacoes: dados.observacoes || '',
      eventoId: dados.eventoId || null, eventoNome: ev?.nome || null,
    };
    if (!novo) {
      return acao(() => salvar(entidadeId, 'contas', conta.id, { ...base, valor: arred(dados.valor), vencimento: dados.vencimento }), 'Conta atualizada');
    }
    const n = Math.max(1, Math.min(60, Number(dados.parcelas) || 1));
    const dia = Number(dados.vencimento.slice(8));
    const itens = Array.from({ length: n }, (_, i) => {
      const c = somarMeses(dados.vencimento.slice(0, 7), i);
      const ult = Number(ultimoDiaMes(c).slice(8));
      return {
        ...base, valor: arred(dados.valor), status: 'aberto',
        vencimento: `${c}-${String(Math.min(dia, ult)).padStart(2, '0')}`,
        parcela: n > 1 ? `${i + 1}/${n}` : null,
      };
    });
    return acao(() => emLotes(itens, (lote, it) => lote.criar(entidadeId, 'contas', it)), n > 1 ? `${n} parcelas lançadas` : 'Conta lançada');
  }

  async function remover() {
    if (!window.confirm(`Excluir a conta "${conta.descricao}"?`)) return;
    if (await acao(() => excluir(entidadeId, 'contas', conta.id), 'Conta excluída')) aoFechar();
  }

  return (
    <ModalForm titulo={novo ? `Nova conta a ${dados.tipo === 'pagar' ? 'pagar' : 'receber'}` : 'Editar conta'} aoFechar={aoFechar} aoSalvar={gravar}
      extraRodape={!novo && <button type="button" className="btn btn-perigo" onClick={remover}>Excluir</button>}>
      <div className="form-grade">
        {novo && (
          <Campo rotulo="Tipo" className="col-2">
            <select {...ligar('tipo')}><option value="pagar">A pagar (despesa)</option><option value="receber">A receber (receita)</option></select>
          </Campo>
        )}
        <Campo rotulo="Descrição" className="col-2"><input placeholder={dados.tipo === 'pagar' ? 'Conta de luz do galpão' : 'Patrocínio do baile da Semana Farroupilha'} {...ligar('descricao', { obrigatorio: true })} autoFocus /></Campo>
        <Campo rotulo={dados.tipo === 'pagar' ? 'Fornecedor / favorecido' : 'Quem vai pagar'}><input {...ligar('pessoa')} /></Campo>
        <Campo rotulo="Categoria"><select {...ligar('categoria')}>{categorias.map((c) => <option key={c}>{c}</option>)}</select></Campo>
        <Campo rotulo={novo && Number(dados.parcelas) > 1 ? 'Valor de cada parcela (R$)' : 'Valor (R$)'}><input type="number" step="0.01" min="0.01" {...ligar('valor', { obrigatorio: true })} /></Campo>
        <Campo rotulo={novo && Number(dados.parcelas) > 1 ? 'Vencimento da 1ª parcela' : 'Vencimento'}><input type="date" {...ligar('vencimento', { obrigatorio: true })} /></Campo>
        {novo && <Campo rotulo="Repetir / parcelas" ajuda="1 = conta única. Ex.: 12 para a luz do ano todo"><input type="number" min="1" max="60" {...ligar('parcelas', { numero: true })} /></Campo>}
        <Campo rotulo="Nº do documento" ajuda="Nota, boleto, contrato"><input {...ligar('documento')} /></Campo>
        <Campo rotulo="Evento relacionado" className="col-2" ajuda="Opcional: entra no resultado do evento">
          <select {...ligar('eventoId')}>
            <option value="">Nenhum</option>
            {eventos.dados.map((e) => <option key={e.id} value={e.id}>{e.nome} — {fmtData(e.data)}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Observações" className="col-2"><textarea {...ligar('observacoes')} /></Campo>
      </div>
    </ModalForm>
  );
}

function BaixarConta({ conta, aoFechar }) {
  const { entidadeId, config } = useAuth();
  const acao = useAcao();
  const { dados, ligar } = useFormulario({ data: hoje(), forma: 'PIX', conta: config.contasFinanceiras[0], valorPago: conta.valor });
  const pagar = conta.tipo === 'pagar';

  function gravar() {
    return acao(async () => {
      const lote = novoLote();
      const valorPago = arred(dados.valorPago);
      const caixaId = lote.criar(entidadeId, 'caixa', {
        data: dados.data, tipo: pagar ? 'saida' : 'entrada', valor: valorPago, categoria: conta.categoria,
        descricao: conta.descricao + (conta.parcela ? ` (${conta.parcela})` : '') + (conta.pessoa ? ` — ${conta.pessoa}` : ''),
        conta: dados.conta, forma: dados.forma, origem: 'conta', refId: conta.id,
        eventoId: conta.eventoId || null, eventoNome: conta.eventoNome || null,
      });
      lote.atualizar(entidadeId, 'contas', conta.id, { status: 'pago', dataPagamento: dados.data, forma: dados.forma, conta: dados.conta, valorPago, caixaId });
      await lote.commit();
    }, pagar ? 'Pagamento registrado' : 'Recebimento registrado');
  }

  return (
    <ModalForm titulo={pagar ? 'Pagar conta' : 'Receber conta'} aoFechar={aoFechar} aoSalvar={gravar} textoSalvar={pagar ? 'Confirmar pagamento' : 'Confirmar recebimento'}>
      <p><strong>{conta.descricao}</strong>{conta.parcela && ` (${conta.parcela})`}<br />Vencimento {fmtData(conta.vencimento)}, valor {fmtMoeda(conta.valor)}</p>
      <div className="form-grade">
        <Campo rotulo={pagar ? 'Data do pagamento' : 'Data do recebimento'}><input type="date" {...ligar('data', { obrigatorio: true })} /></Campo>
        <Campo rotulo="Valor efetivo (R$)" ajuda="Com juros ou desconto, se houver"><input type="number" step="0.01" min="0" {...ligar('valorPago', { obrigatorio: true })} /></Campo>
        <Campo rotulo="Forma"><select {...ligar('forma')}>{FORMAS_PAGAMENTO.map((f) => <option key={f}>{f}</option>)}</select></Campo>
        <Campo rotulo={pagar ? 'Saiu de' : 'Entrou em'}><select {...ligar('conta')}>{config.contasFinanceiras.map((c) => <option key={c}>{c}</option>)}</select></Campo>
      </div>
    </ModalForm>
  );
}
