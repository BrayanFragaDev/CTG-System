import { useMemo, useState } from 'react';
import { orderBy, where, limit } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useColecao, salvar, excluir, resumoDe, emLotes } from '../lib/db';
import {
  abrirCopa, fecharCopa, conferirCopa, estornarConferencia, registrarCompra, ajustarEstoque, resumoSessao, num,
} from '../lib/estoque';
import { CATEGORIAS_PRODUTO, UNIDADES, PRODUTOS_SUGERIDOS, FORMAS_PAGAMENTO } from '../lib/constantes';
import { fmtMoeda, fmtData, hoje, arred, normalizar, somar } from '../lib/format';
import { relatorioPdf } from '../lib/pdf';
import { baixarCsv } from '../lib/csv';
import {
  Abas, Cabecalho, Campo, Carregando, ErroLeitura, Modal, ModalForm, Selo, Vazio, useAcao, useFormulario,
} from '../components/ui';
import Icone from '../components/Icone';

const STATUS = {
  aberta: { tipo: 'pendente', texto: 'Aberta' },
  fechada: { tipo: 'info', texto: 'Aguardando conferência' },
  conferida: { tipo: 'ok', texto: 'Conferida e lançada no caixa' },
};
const TIPOS_MOV = { compra: 'Compra', venda: 'Venda', perda: 'Perda', consumo: 'Consumo / cortesia', ajuste: 'Ajuste de contagem' };

const margem = (p) => (num(p.precoVenda) > 0 ? Math.round(((num(p.precoVenda) - num(p.precoCusto)) / num(p.precoVenda)) * 100) : null);
const baixo = (p) => p.ativo !== false && num(p.estoqueMinimo) > 0 && num(p.estoque) <= num(p.estoqueMinimo);

export default function Estoque() {
  const { entidadeId, papel, podeEditar } = useAuth();
  const produtos = useColecao(entidadeId, 'produtos', [orderBy('nome')]);
  const sessoes = useColecao(entidadeId, 'copa', [orderBy('data', 'desc'), limit(40)]);
  const gestor = ['superadmin', 'admin', 'tesoureiro'].includes(papel);   // preços, compras, conferência
  const [aba, setAba] = useState('copa');

  const ativos = produtos.dados.filter((p) => p.ativo !== false);
  const emBaixa = ativos.filter(baixo);
  const valorEstoque = arred(ativos.reduce((s, p) => s + Math.max(0, num(p.estoque)) * num(p.precoCusto), 0));
  const aguardando = sessoes.dados.filter((s) => s.status === 'fechada');
  const abertas = sessoes.dados.filter((s) => s.status === 'aberta');

  const abas = [
    { id: 'copa', rotulo: 'Copa dos eventos', contagem: abertas.length + aguardando.length || null },
    { id: 'produtos', rotulo: 'Produtos e estoque', contagem: emBaixa.length || null },
    gestor && { id: 'compras', rotulo: 'Compras' },
    papel !== 'copa' && { id: 'relatorio', rotulo: 'Relatório' },
  ].filter(Boolean);

  return (
    <>
      <Cabecalho titulo="Copa e estoque" descricao="Bebidas e comidas vendidas nos eventos: estoque, fechamento da copa a cada baile e conferência do dinheiro." />
      <div className="indicadores">
        <div className="indicador"><div className="rotulo">Produtos ativos</div><div className="valor">{ativos.length}</div>
          {gestor && <div className="detalhe">Estoque a preço de custo: {fmtMoeda(valorEstoque)}</div>}</div>
        <div className={`indicador ${emBaixa.length ? 'alerta' : ''}`}><div className="rotulo">Abaixo do mínimo</div><div className="valor">{emBaixa.length}</div>
          <div className="detalhe">{emBaixa.slice(0, 3).map((p) => p.nome).join(', ') || 'Estoque em dia'}</div></div>
        <div className={`indicador ${aguardando.length ? 'alerta' : ''}`}><div className="rotulo">Copas aguardando conferência</div><div className="valor">{aguardando.length}</div>
          <div className="detalhe">{abertas.length ? `${abertas.length} copa(s) aberta(s) agora` : 'Nenhuma copa aberta'}</div></div>
      </div>
      <ErroLeitura erro={produtos.erro || sessoes.erro} />
      <div className="painel">
        <Abas ativa={aba} aoTrocar={setAba} abas={abas} />
        {aba === 'copa' && <AbaCopa sessoes={sessoes} produtos={produtos.dados} gestor={gestor} podeOperar={podeEditar('estoque')} />}
        {aba === 'produtos' && <AbaProdutos produtos={produtos} gestor={gestor} podeOperar={podeEditar('estoque')} />}
        {aba === 'compras' && gestor && <AbaCompras produtos={ativos} />}
        {aba === 'relatorio' && <AbaRelatorio />}
      </div>
    </>
  );
}

// =================== Produtos ===================
function AbaProdutos({ produtos, gestor, podeOperar }) {
  const { entidadeId } = useAuth();
  const acao = useAcao();
  const [busca, setBusca] = useState('');
  const [verInativos, setVerInativos] = useState(false);
  const [editando, setEditando] = useState(null);
  const [ajustando, setAjustando] = useState(null);
  const [historico, setHistorico] = useState(null);

  const lista = produtos.dados.filter((p) => (verInativos || p.ativo !== false) && (!busca || normalizar(p.nome).includes(normalizar(busca))));

  function sugeridos() {
    return acao(() => emLotes(PRODUTOS_SUGERIDOS, (lote, p) => lote.criar(entidadeId, 'produtos', {
      ...p, precoVenda: 0, precoCusto: 0, estoque: 0, estoqueMinimo: 0, ativo: true,
    }), 400, entidadeId, 'Produtos sugeridos da copa'), 'Produtos criados. Agora ajuste os preços.');
  }

  return (
    <>
      <div className="filtros">
        <Campo rotulo="Buscar"><input type="search" placeholder="Nome do produto" value={busca} onChange={(e) => setBusca(e.target.value)} /></Campo>
        <label className="checkbox"><input type="checkbox" checked={verInativos} onChange={(e) => setVerInativos(e.target.checked)} />Mostrar inativos</label>
        <div className="acoes" style={{ marginLeft: 'auto' }}>
          {gestor && <button type="button" className="btn btn-primario" onClick={() => setEditando({})}><Icone nome="mais" tam={18} />Novo produto</button>}
        </div>
      </div>
      {produtos.carregando ? <Carregando /> : !produtos.dados.length ? (
        <Vazio titulo="Nenhum produto cadastrado">
          {gestor ? (
            <>
              <p>Comece com os itens mais comuns da copa (cervejas, refrigerantes, águas, doces) e ajuste os preços depois.</p>
              <div className="acoes" style={{ justifyContent: 'center' }}>
                <button type="button" className="btn btn-primario" onClick={sugeridos}>Começar com itens comuns</button>
                <button type="button" className="btn" onClick={() => setEditando({})}>Cadastrar do zero</button>
              </div>
            </>
          ) : <p>O patrão ou o tesoureiro cadastram os produtos e os preços.</p>}
        </Vazio>
      ) : (
        <div className="tabela-wrap">
          <table>
            <thead><tr><th>Produto</th><th className="num">Em estoque</th><th className="num esconder-mobile">Mínimo</th>
              <th className="num esconder-mobile">Custo</th><th className="num">Venda</th><th className="num esconder-mobile">Margem</th><th /></tr></thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.nome}</strong><span className="sub">{p.categoria}{p.ativo === false ? ' — inativo' : ''}</span></td>
                  <td className="num"><strong>{num(p.estoque)}</strong> <span className="sub" style={{ display: 'inline' }}>{p.unidade}</span>
                    {baixo(p) && <><br /><Selo tipo="atraso">repor</Selo></>}</td>
                  <td className="num esconder-mobile">{num(p.estoqueMinimo) || '—'}</td>
                  <td className="num esconder-mobile">{fmtMoeda(p.precoCusto)}</td>
                  <td className="num">{num(p.precoVenda) ? fmtMoeda(p.precoVenda) : <Selo tipo="pendente">sem preço</Selo>}</td>
                  <td className="num esconder-mobile">{margem(p) == null ? '—' : `${margem(p)}%`}</td>
                  <td className="acoes-celula">
                    {podeOperar && <button type="button" className="btn btn-peq" onClick={() => setAjustando(p)}>Ajustar</button>}{' '}
                    <button type="button" className="btn-link" onClick={() => setHistorico(p)}>Histórico</button>{' '}
                    {gestor && <button type="button" className="btn-link" onClick={() => setEditando(p)}>Editar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editando && <FormProduto produto={editando} aoFechar={() => setEditando(null)} />}
      {ajustando && <FormAjuste produto={ajustando} aoFechar={() => setAjustando(null)} />}
      {historico && <HistoricoProduto produto={historico} aoFechar={() => setHistorico(null)} />}
    </>
  );
}

function FormProduto({ produto, aoFechar }) {
  const { entidadeId } = useAuth();
  const acao = useAcao();
  const novo = !produto.id;
  const { dados, ligar } = useFormulario({ categoria: 'Bebidas', unidade: 'un', precoVenda: '', precoCusto: '', estoque: 0, estoqueMinimo: '', ativo: true, ...produto });

  function gravar() {
    return acao(() => salvar(entidadeId, 'produtos', produto.id, {
      nome: dados.nome.trim(), categoria: dados.categoria, unidade: dados.unidade,
      precoVenda: arred(num(dados.precoVenda)), precoCusto: arred(num(dados.precoCusto)),
      estoqueMinimo: num(dados.estoqueMinimo), ativo: Boolean(dados.ativo),
      ...(novo ? { estoque: num(dados.estoque) } : {}),
    }), novo ? 'Produto cadastrado' : 'Produto atualizado');
  }
  async function remover() {
    if (!window.confirm(`Excluir "${produto.nome}"? O histórico de vendas continua nos relatórios. Para só tirar da copa, prefira desmarcar "Produto ativo".`)) return;
    if (await acao(() => excluir(entidadeId, 'produtos', produto.id, resumoDe('produtos', produto)), 'Produto excluído')) aoFechar();
  }

  return (
    <ModalForm titulo={novo ? 'Novo produto' : `Editar ${produto.nome}`} aoFechar={aoFechar} aoSalvar={gravar}
      extraRodape={!novo && <button type="button" className="btn btn-perigo" onClick={remover}>Excluir</button>}>
      <div className="form-grade">
        <Campo rotulo="Nome" className="col-2"><input placeholder="Cerveja lata 350 ml" {...ligar('nome', { obrigatorio: true })} autoFocus /></Campo>
        <Campo rotulo="Categoria"><select {...ligar('categoria')}>{CATEGORIAS_PRODUTO.map((c) => <option key={c}>{c}</option>)}</select></Campo>
        <Campo rotulo="Unidade"><select {...ligar('unidade')}>{UNIDADES.map((u) => <option key={u}>{u}</option>)}</select></Campo>
        <Campo rotulo="Preço de venda (R$)"><input type="number" step="0.01" min="0" {...ligar('precoVenda', { obrigatorio: true })} /></Campo>
        <Campo rotulo="Custo (R$)" ajuda="Atualiza sozinho a cada compra"><input type="number" step="0.01" min="0" {...ligar('precoCusto')} /></Campo>
        {novo && <Campo rotulo="Quantidade em estoque hoje"><input type="number" step="1" {...ligar('estoque')} /></Campo>}
        <Campo rotulo="Estoque mínimo" ajuda="Abaixo disso, avisa para repor"><input type="number" step="1" min="0" {...ligar('estoqueMinimo')} /></Campo>
        <div className="col-2" style={{ marginBottom: '1rem' }}><label className="checkbox"><input type="checkbox" checked={Boolean(dados.ativo)} onChange={ligar('ativo').onChange} />Produto ativo (aparece na copa)</label></div>
      </div>
    </ModalForm>
  );
}

function FormAjuste({ produto, aoFechar }) {
  const { entidadeId } = useAuth();
  const acao = useAcao();
  const { dados, ligar } = useFormulario({ tipo: 'ajuste', novaQuantidade: num(produto.estoque), quantidade: '', motivo: '', data: hoje() });
  const contagem = dados.tipo === 'ajuste';
  return (
    <ModalForm titulo={`Ajustar ${produto.nome}`} aoFechar={aoFechar} textoSalvar="Registrar"
      aoSalvar={() => acao(() => ajustarEstoque(entidadeId, produto, dados), 'Estoque atualizado')}>
      <p>Hoje o sistema registra <strong>{num(produto.estoque)} {produto.unidade}</strong>.</p>
      <div className="form-grade">
        <Campo rotulo="O que aconteceu" className="col-2">
          <select {...ligar('tipo')}>
            <option value="ajuste">Contei o estoque e o número é outro</option>
            <option value="perda">Perda (quebrou, venceu, estragou)</option>
            <option value="consumo">Consumo da diretoria / cortesia</option>
          </select>
        </Campo>
        {contagem
          ? <Campo rotulo="Quantidade contada"><input type="number" step="1" {...ligar('novaQuantidade', { obrigatorio: true })} autoFocus /></Campo>
          : <Campo rotulo="Quantidade"><input type="number" step="1" min="1" {...ligar('quantidade', { obrigatorio: true })} autoFocus /></Campo>}
        <Campo rotulo="Data"><input type="date" {...ligar('data', { obrigatorio: true })} /></Campo>
        <Campo rotulo="Motivo / observação" className="col-2"><input placeholder={contagem ? 'Contagem de fim de mês' : 'Engradado caiu no transporte'} {...ligar('motivo')} /></Campo>
      </div>
    </ModalForm>
  );
}

function HistoricoProduto({ produto, aoFechar }) {
  const { entidadeId } = useAuth();
  const movs = useColecao(entidadeId, 'movEstoque', [where('produtoId', '==', produto.id)], produto.id);
  const lista = [...movs.dados].sort((a, b) => b.data.localeCompare(a.data) || (b.criadoEm?.seconds || 0) - (a.criadoEm?.seconds || 0));
  const sinal = (m) => (m.tipo === 'compra' ? '+' : m.tipo === 'ajuste' ? (m.quantidade > 0 ? '+' : '') : '−');
  return (
    <Modal largo titulo={`Histórico — ${produto.nome}`} aoFechar={aoFechar}>
      <p>Em estoque agora: <strong>{num(produto.estoque)} {produto.unidade}</strong></p>
      {movs.carregando ? <Carregando /> : !lista.length ? <p className="sub">Nenhum movimento ainda.</p> : (
        <div className="tabela-wrap" style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid var(--linha)', borderRadius: 6 }}>
          <table>
            <thead><tr><th>Data</th><th>Movimento</th><th className="num">Quantidade</th><th className="esconder-mobile">Por</th></tr></thead>
            <tbody>
              {lista.map((m) => (
                <tr key={m.id}>
                  <td>{fmtData(m.data)}</td>
                  <td>{TIPOS_MOV[m.tipo]}<span className="sub">{m.motivo || m.fornecedor || ''}</span></td>
                  <td className="num">{sinal(m)}{Math.abs(m.quantidade)}</td>
                  <td className="esconder-mobile sub">{m.atualizadoPor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

// =================== Copa dos eventos ===================
function AbaCopa({ sessoes, produtos, gestor, podeOperar }) {
  const [abrir, setAbrir] = useState(false);
  const [aberta, setAberta] = useState(null);
  const sessao = sessoes.dados.find((s) => s.id === aberta);
  const semPreco = produtos.filter((p) => p.ativo !== false && !num(p.precoVenda)).length;

  return (
    <>
      <div className="filtros">
        <p style={{ margin: 0, flex: 1, minWidth: 260, color: 'var(--tinta-2)' }}>
          Antes do baile, <strong>abra a copa</strong> contando o estoque. No fim, <strong>feche</strong> contando o que sobrou: o sistema calcula o que foi vendido e quanto deveria ter entrado.
        </p>
        {podeOperar && <button type="button" className="btn btn-primario" onClick={() => setAbrir(true)} disabled={!produtos.length}>Abrir a copa</button>}
      </div>
      {semPreco > 0 && <div className="painel-corpo" style={{ paddingBottom: 0 }}><div className="aviso">{semPreco} produto(s) ativo(s) sem preço de venda. Ajuste em <strong>Produtos e estoque</strong> antes de fechar a copa.</div></div>}
      {sessoes.carregando ? <Carregando /> : !sessoes.dados.length ? (
        <Vazio titulo="Nenhuma copa registrada ainda">{!produtos.length ? 'Cadastre os produtos primeiro, na aba Produtos e estoque.' : 'Abra a copa no próximo evento.'}</Vazio>
      ) : (
        <div className="tabela-wrap">
          <table>
            <thead><tr><th>Data</th><th>Evento</th><th className="num">Deveria entrar</th><th className="num">Entrou</th><th className="num">Diferença</th><th>Situação</th></tr></thead>
            <tbody>
              {sessoes.dados.map((s) => (
                <tr key={s.id} className="clicavel" onClick={() => setAberta(s.id)}>
                  <td>{fmtData(s.data)}</td>
                  <td><strong>{s.eventoNome || 'Copa avulsa'}</strong><span className="sub">{s.responsavel}</span></td>
                  <td className="num">{s.status === 'aberta' ? '—' : fmtMoeda(s.esperado)}</td>
                  <td className="num">{s.status === 'aberta' ? '—' : fmtMoeda(s.totalRecebido)}</td>
                  <td className="num">{s.status === 'aberta' ? '—' : <Diferenca valor={s.diferenca} />}</td>
                  <td><Selo tipo={STATUS[s.status].tipo}>{STATUS[s.status].texto}</Selo></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {abrir && <AbrirCopa produtos={produtos} aoFechar={() => setAbrir(false)} aoAbrir={(id) => { setAbrir(false); setAberta(id); }} />}
      {sessao && <SessaoCopa sessao={sessao} gestor={gestor} podeOperar={podeOperar} aoFechar={() => setAberta(null)} />}
    </>
  );
}

function Diferenca({ valor }) {
  const v = arred(valor);
  if (Math.abs(v) < 0.01) return <Selo tipo="ok">bateu</Selo>;
  return <span className={v < 0 ? 'saida' : 'entrada'}>{v > 0 ? '+' : '−'} {fmtMoeda(Math.abs(v))} {v < 0 ? '(faltou)' : '(sobrou)'}</span>;
}

function AbrirCopa({ produtos, aoFechar, aoAbrir }) {
  const { entidadeId, perfil } = useAuth();
  const acao = useAcao();
  const eventos = useColecao(entidadeId, 'eventos', [orderBy('data', 'desc'), limit(30)]);
  const ativos = produtos.filter((p) => p.ativo !== false);
  const [cab, setCab] = useState({ data: hoje(), eventoId: '', responsavel: perfil?.nome || '' });
  const [contagem, setContagem] = useState(() => Object.fromEntries(ativos.map((p) => [p.id, num(p.estoque)])));
  const proximos = [...eventos.dados].sort((a, b) => Math.abs(new Date(a.data) - new Date(cab.data)) - Math.abs(new Date(b.data) - new Date(cab.data)));

  async function gravar() {
    const evento = eventos.dados.find((e) => e.id === cab.eventoId) || null;
    let id = null;
    const ok = await acao(async () => {
      id = await abrirCopa(entidadeId, {
        data: cab.data, evento, responsavel: cab.responsavel,
        itens: ativos.map((p) => ({ produtoId: p.id, nome: p.nome, unidade: p.unidade, preco: num(p.precoVenda), custo: num(p.precoCusto), sistema: num(p.estoque), inicio: num(contagem[p.id]) })),
      });
    }, 'Copa aberta. Bom baile!');
    if (ok) aoAbrir(id);
    return false;
  }

  return (
    <ModalForm largo titulo="Abrir a copa" aoFechar={aoFechar} aoSalvar={gravar} textoSalvar="Abrir a copa">
      <div className="form-grade-3">
        <Campo rotulo="Data"><input type="date" value={cab.data} onChange={(e) => setCab({ ...cab, data: e.target.value })} required /></Campo>
        <Campo rotulo="Evento">
          <select value={cab.eventoId} onChange={(e) => setCab({ ...cab, eventoId: e.target.value })}>
            <option value="">Sem evento (copa avulsa)</option>
            {proximos.map((e) => <option key={e.id} value={e.id}>{e.nome} — {fmtData(e.data)}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Responsável pela copa"><input value={cab.responsavel} onChange={(e) => setCab({ ...cab, responsavel: e.target.value })} /></Campo>
      </div>
      <p>Conte <strong>tudo</strong> que há na copa e no depósito. Já vem preenchido com o que o sistema espera; corrija o que estiver diferente.</p>
      <div className="tabela-wrap" style={{ border: '1px solid var(--linha)', borderRadius: 6 }}>
        <table className="tabela-contagem">
          <thead><tr><th>Produto</th><th className="num">O sistema espera</th><th className="num" style={{ width: 160 }}>Contei</th></tr></thead>
          <tbody>
            {ativos.map((p) => {
              const dif = num(contagem[p.id]) - num(p.estoque);
              return (
                <tr key={p.id}>
                  <td>{p.nome}<span className="sub">{p.unidade}</span></td>
                  <td className="num" data-rotulo="Sistema espera">{num(p.estoque)}</td>
                  <td className="num" data-rotulo="Contei"><input type="number" step="1" aria-label={`Contagem de ${p.nome}`} value={contagem[p.id]} onChange={(e) => setContagem({ ...contagem, [p.id]: e.target.value })} />
                    {dif !== 0 && <span className="sub" style={{ color: 'var(--ouro)' }}>{dif > 0 ? '+' : ''}{dif} vira ajuste</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ModalForm>
  );
}

function SessaoCopa({ sessao: s, gestor, podeOperar, aoFechar }) {
  const { entidadeId, entidade, config } = useAuth();
  const acao = useAcao();
  const editavel = s.status === 'aberta' && podeOperar;
  const [itens, setItens] = useState(() => s.itens.map((i) => ({ ...i, fim: i.fim ?? '', reposicao: i.reposicao || '', cortesia: i.cortesia || '' })));
  const [recebido, setRecebido] = useState({ dinheiro: s.recebido?.dinheiro ?? '', pix: s.recebido?.pix ?? '', cartao: s.recebido?.cartao ?? '' });
  const [obs, setObs] = useState(s.obs || '');
  const [contas, setContas] = useState({ dinheiro: config.contasFinanceiras[0], pix: config.contasFinanceiras[1] || config.contasFinanceiras[0], cartao: config.contasFinanceiras[1] || config.contasFinanceiras[0] });
  // Produto ainda não contado no fim conta como "nada vendido" até a contagem
  const r = useMemo(() => resumoSessao(itens.map((i) => (i.fim === '' || i.fim == null
    ? { ...i, fim: num(i.inicio) + num(i.reposicao) - num(i.cortesia) } : i)), recebido), [itens, recebido]);
  const faltamContar = itens.filter((i) => i.fim === '' || i.fim == null).length;
  const mudar = (idx, campo, v) => setItens(itens.map((i, k) => (k === idx ? { ...i, [campo]: v } : i)));

  const salvarRascunho = () => acao(() => salvar(entidadeId, 'copa', s.id, {
    data: s.data, status: 'aberta', itens: itens.map((i) => ({ ...i, reposicao: num(i.reposicao), cortesia: num(i.cortesia), fim: i.fim === '' ? null : num(i.fim) })),
  }, `Copa ${s.eventoNome || fmtData(s.data)}: reposição/contagem parcial salva`), 'Anotações salvas');

  async function fechar() {
    if (faltamContar) { window.alert(`Falta contar ${faltamContar} produto(s). Se acabou, informe 0.`); return; }
    const negativos = r.linhas.filter((l) => l.vendido < 0);
    if (negativos.length && !window.confirm(`A conta não fecha para ${negativos.map((n) => n.nome).join(', ')} (sobrou mais do que havia). Confira a reposição. Fechar mesmo assim?`)) return;
    const msg = Math.abs(r.diferenca) < 0.01 ? 'O caixa da copa bateu certinho.' : `Diferença de ${fmtMoeda(Math.abs(r.diferenca))} (${r.diferenca < 0 ? 'faltou' : 'sobrou'}).`;
    if (!window.confirm(`Fechar a copa?\n\nDeveria entrar: ${fmtMoeda(r.esperado)}\nEntrou: ${fmtMoeda(r.totalRecebido)}\n${msg}\n\nDepois de fechada, só o patrão ou o tesoureiro podem mexer.`)) return;
    await acao(() => fecharCopa(entidadeId, s, itens, recebido, obs), 'Copa fechada. O tesoureiro vai conferir e lançar no caixa.');
  }

  const conferir = () => acao(() => conferirCopa(entidadeId, s, contas, config.categoriasReceita.find((c) => /copa|bar/i.test(c)) || config.categoriasReceita[0]), 'Copa conferida e lançada no caixa');
  const desfazer = () => window.confirm('Desfazer a conferência? Os lançamentos da copa saem do caixa.') && acao(() => estornarConferencia(entidadeId, s), 'Conferência desfeita');

  function pdf() {
    relatorioPdf({
      entidade, titulo: `Fechamento da copa — ${s.eventoNome || fmtData(s.data)}`, subtitulo: `${fmtData(s.data)}${s.responsavel ? `, responsável: ${s.responsavel}` : ''}`, paisagem: true,
      resumo: [['Deveria entrar', fmtMoeda(r.esperado)], ['Entrou (dinheiro + PIX + cartão)', fmtMoeda(r.totalRecebido)], ['Diferença', fmtMoeda(r.diferenca)], ['Custo do que foi vendido', fmtMoeda(r.custo)], ['Lucro da copa', fmtMoeda(r.lucro)]],
      secoes: [{
        colunas: ['Produto', 'Início', 'Reposição', 'Fim', 'Cortesia', 'Vendido', 'Preço', 'Valor'],
        linhas: r.linhas.map((l) => [l.nome, num(l.inicio), num(l.reposicao), num(l.fim), num(l.cortesia), l.vendido, fmtMoeda(l.preco), fmtMoeda(l.valor)]),
        rodape: ['Total', '', '', '', '', r.linhas.reduce((t, l) => t + l.vendido, 0), '', fmtMoeda(r.esperado)], alinharDireita: [1, 2, 3, 4, 5, 6, 7],
      }],
    });
  }

  return (
    <Modal largo titulo={`Copa — ${s.eventoNome || 'avulsa'}, ${fmtData(s.data)}`} aoFechar={aoFechar} rodape={<>
      <button type="button" className="btn" onClick={pdf}><Icone nome="pdf" tam={18} />PDF do fechamento</button>
      <span style={{ flex: 1 }} />
      {editavel && <button type="button" className="btn" onClick={salvarRascunho}>Salvar anotações</button>}
      {editavel && <button type="button" className="btn btn-primario" onClick={fechar}>Fechar a copa</button>}
      {s.status === 'fechada' && gestor && <button type="button" className="btn btn-ok" onClick={conferir}>Conferir e lançar no caixa</button>}
      {s.status === 'conferida' && gestor && <button type="button" className="btn btn-perigo" onClick={desfazer}>Desfazer conferência</button>}
    </>}>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <Selo tipo={STATUS[s.status].tipo}>{STATUS[s.status].texto}</Selo>
        {s.responsavel && <Selo>Responsável: {s.responsavel}</Selo>}
        {s.conferidaPor && <Selo>Conferida por {s.conferidaPor}</Selo>}
      </div>
      {editavel && <p>Durante o evento, anote em <strong>Reposição</strong> o que chegou depois da abertura. No fim, conte o que sobrou em <strong>Fim</strong> e o que foi dado ou perdido em <strong>Cortesia</strong>.</p>}
      <div className="tabela-wrap" style={{ border: '1px solid var(--linha)', borderRadius: 6 }}>
        <table className="tabela-contagem">
          <thead><tr><th>Produto</th><th className="num">Início</th><th className="num">Reposição</th><th className="num">Fim</th><th className="num">Cortesia</th><th className="num">Vendido</th><th className="num">Valor</th></tr></thead>
          <tbody>
            {r.linhas.map((l, idx) => (
              <tr key={l.produtoId}>
                <td>{l.nome}<span className="sub">{fmtMoeda(l.preco)} / {l.unidade}</span></td>
                <td className="num" data-rotulo="Início">{num(l.inicio)}</td>
                {['reposicao', 'fim', 'cortesia'].map((c) => (
                  <td key={c} className="num" data-rotulo={{ reposicao: 'Reposição', fim: 'Fim', cortesia: 'Cortesia' }[c]}>{editavel
                    ? <input type="number" step="1" min="0" aria-label={`${c} de ${l.nome}`} value={itens[idx][c]} onChange={(e) => mudar(idx, c, e.target.value)} />
                    : num(l[c])}</td>
                ))}
                <td className="num" data-rotulo="Vendido"><strong style={{ color: l.vendido < 0 ? 'var(--lenco)' : undefined }}>{itens[idx].fim === '' ? '—' : l.vendido}</strong></td>
                <td className="num" data-rotulo="Valor">{itens[idx].fim === '' ? '—' : fmtMoeda(l.valor)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={5}>Deveria entrar</td><td className="num">{r.linhas.reduce((t, l) => t + l.vendido, 0)}</td><td className="num">{fmtMoeda(r.esperado)}</td></tr></tfoot>
        </table>
      </div>

      <h3 style={{ margin: '1.5rem 0 .5rem' }}>Quanto entrou</h3>
      <div className="form-grade-3">
        {[['dinheiro', 'Dinheiro (R$)'], ['pix', 'PIX (R$)'], ['cartao', 'Cartão (R$)']].map(([k, rot]) => (
          <Campo key={k} rotulo={rot}>
            <input type="number" step="0.01" min="0" value={recebido[k]} disabled={!editavel} onChange={(e) => setRecebido({ ...recebido, [k]: e.target.value })} />
          </Campo>
        ))}
      </div>
      {editavel && <p className="sub" style={{ marginTop: '-.5rem' }}>Se a copa trabalha com fichas, informe aqui o que entrou na venda das fichas.</p>}
      <div className="indicadores" style={{ margin: '1rem 0' }}>
        <div className="indicador"><div className="rotulo">Deveria entrar</div><div className="valor">{fmtMoeda(r.esperado)}</div></div>
        <div className="indicador"><div className="rotulo">Entrou</div><div className="valor">{fmtMoeda(r.totalRecebido)}</div></div>
        <div className={`indicador ${r.diferenca < -0.009 ? 'alerta' : 'positivo'}`}><div className="rotulo">Diferença</div><div className="valor">{fmtMoeda(r.diferenca)}</div>
          <div className="detalhe">{Math.abs(r.diferenca) < 0.01 ? 'Bateu' : r.diferenca < 0 ? 'Faltou dinheiro' : 'Sobrou dinheiro'}</div></div>
        {gestor && <div className="indicador"><div className="rotulo">Lucro da copa</div><div className="valor">{fmtMoeda(r.lucro)}</div><div className="detalhe">custo {fmtMoeda(r.custo)}</div></div>}
      </div>
      {editavel ? <Campo rotulo="Observações"><textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: 2 latas devolvidas ao fornecedor" /></Campo>
        : s.obs && <p><strong>Observações:</strong> {s.obs}</p>}

      {s.status === 'fechada' && gestor && (
        <div className="faixa-acao" style={{ display: 'block' }}>
          <p style={{ margin: '0 0 .6rem' }}><strong>Conferência do tesoureiro.</strong> Confira o dinheiro e escolha onde cada forma de pagamento entrou. Os lançamentos vão para o caixa{s.eventoNome ? ' e para a prestação de contas do evento' : ''}.</p>
          <div className="form-grade-3">
            {[['dinheiro', 'Dinheiro entrou em'], ['pix', 'PIX entrou em'], ['cartao', 'Cartão entrou em']].filter(([k]) => num(s.recebido?.[k]) > 0).map(([k, rot]) => (
              <Campo key={k} rotulo={rot}><select value={contas[k]} onChange={(e) => setContas({ ...contas, [k]: e.target.value })}>{config.contasFinanceiras.map((c) => <option key={c}>{c}</option>)}</select></Campo>
            ))}
          </div>
        </div>
      )}
      {s.status === 'fechada' && !gestor && <div className="aviso info">Copa fechada. O tesoureiro vai conferir o dinheiro e lançar no caixa.</div>}
    </Modal>
  );
}

// =================== Compras ===================
function AbaCompras({ produtos }) {
  const { entidadeId } = useAuth();
  const movs = useColecao(entidadeId, 'movEstoque', [where('tipo', '==', 'compra')]);
  const [nova, setNova] = useState(false);
  const compras = useMemo(() => {
    const g = {};
    movs.dados.forEach((m) => {
      const k = m.grupo || m.id;
      g[k] = g[k] || { id: k, data: m.data, fornecedor: m.fornecedor, itens: [], total: 0 };
      g[k].itens.push(m);
      g[k].total = arred(g[k].total + num(m.quantidade) * num(m.custoUnit));
    });
    return Object.values(g).sort((a, b) => b.data.localeCompare(a.data));
  }, [movs.dados]);

  return (
    <>
      <div className="filtros">
        <p style={{ margin: 0, flex: 1, minWidth: 260, color: 'var(--tinta-2)' }}>Registrar a compra soma ao estoque, atualiza o custo e já lança a saída no caixa (ou a conta a pagar, se for a prazo).</p>
        <button type="button" className="btn btn-primario" onClick={() => setNova(true)} disabled={!produtos.length}><Icone nome="mais" tam={18} />Registrar compra</button>
      </div>
      {movs.carregando ? <Carregando /> : !compras.length ? <Vazio titulo="Nenhuma compra registrada" /> : (
        <div className="tabela-wrap">
          <table>
            <thead><tr><th>Data</th><th>Fornecedor</th><th className="esconder-mobile">Itens</th><th className="num">Total</th></tr></thead>
            <tbody>{compras.map((c) => (
              <tr key={c.id}><td>{fmtData(c.data)}</td><td>{c.fornecedor || '—'}</td>
                <td className="esconder-mobile">{c.itens.map((i) => `${i.quantidade} ${i.produtoNome}`).join(', ')}</td><td className="num">{fmtMoeda(c.total)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {nova && <FormCompra produtos={produtos} aoFechar={() => setNova(false)} />}
    </>
  );
}

function FormCompra({ produtos, aoFechar }) {
  const { entidadeId, config } = useAuth();
  const acao = useAcao();
  const eventos = useColecao(entidadeId, 'eventos', [orderBy('data', 'desc'), limit(20)]);
  const [cab, setCab] = useState({ data: hoje(), fornecedor: '', eventoId: '', modo: 'agora', conta: config.contasFinanceiras[0], forma: 'PIX', vencimento: hoje() });
  const [linhas, setLinhas] = useState([{ produtoId: '', quantidade: '', custo: '' }]);
  const total = arred(linhas.reduce((s, l) => s + num(l.quantidade) * num(l.custo), 0));
  const mudar = (i, campo, v) => setLinhas(linhas.map((l, k) => {
    if (k !== i) return l;
    const n = { ...l, [campo]: v };
    if (campo === 'produtoId') { const p = produtos.find((x) => x.id === v); if (p && !l.custo) n.custo = num(p.precoCusto) || ''; }
    return n;
  }));

  function gravar() {
    const itens = linhas.filter((l) => l.produtoId && num(l.quantidade) > 0).map((l) => ({ produto: produtos.find((p) => p.id === l.produtoId), quantidade: l.quantidade, custo: l.custo }));
    if (!itens.length) throw new Error('Inclua pelo menos um produto com quantidade.');
    if (!total) throw new Error('Informe o custo dos produtos.');
    const categoria = config.categoriasDespesa.find((c) => /copa|bar/i.test(c)) || config.categoriasDespesa[0];
    return acao(() => registrarCompra(entidadeId, {
      data: cab.data, fornecedor: cab.fornecedor.trim(), itens, categoria,
      evento: eventos.dados.find((e) => e.id === cab.eventoId) || null,
      pagamento: { modo: cab.modo, conta: cab.conta, forma: cab.forma, vencimento: cab.vencimento },
    }), `Compra registrada: ${fmtMoeda(total)}`);
  }

  return (
    <ModalForm largo titulo="Registrar compra" aoFechar={aoFechar} aoSalvar={gravar} textoSalvar={`Registrar ${fmtMoeda(total)}`}>
      <div className="form-grade-3">
        <Campo rotulo="Data"><input type="date" value={cab.data} onChange={(e) => setCab({ ...cab, data: e.target.value })} required /></Campo>
        <Campo rotulo="Fornecedor"><input placeholder="Distribuidora Rio Grande" value={cab.fornecedor} onChange={(e) => setCab({ ...cab, fornecedor: e.target.value })} /></Campo>
        <Campo rotulo="Para o evento (opcional)">
          <select value={cab.eventoId} onChange={(e) => setCab({ ...cab, eventoId: e.target.value })}>
            <option value="">Estoque geral</option>
            {eventos.dados.map((e) => <option key={e.id} value={e.id}>{e.nome} — {fmtData(e.data)}</option>)}
          </select>
        </Campo>
      </div>
      <div className="tabela-wrap" style={{ border: '1px solid var(--linha)', borderRadius: 6, marginBottom: '.6rem' }}>
        <table className="tabela-contagem">
          <thead><tr><th>Produto</th><th className="num" style={{ width: 130 }}>Quantidade</th><th className="num" style={{ width: 150 }}>Custo unit. (R$)</th><th className="num">Subtotal</th><th /></tr></thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={i}>
                <td><select aria-label="Produto" value={l.produtoId} onChange={(e) => mudar(i, 'produtoId', e.target.value)}>
                  <option value="">Escolha…</option>{produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></td>
                <td className="num" data-rotulo="Quantidade"><input type="number" step="1" min="0" aria-label="Quantidade" value={l.quantidade} onChange={(e) => mudar(i, 'quantidade', e.target.value)} /></td>
                <td className="num" data-rotulo="Custo unit."><input type="number" step="0.01" min="0" aria-label="Custo unitário" value={l.custo} onChange={(e) => mudar(i, 'custo', e.target.value)} /></td>
                <td className="num" data-rotulo="Subtotal">{fmtMoeda(num(l.quantidade) * num(l.custo))}</td>
                <td>{linhas.length > 1 && <button type="button" className="btn-link" onClick={() => setLinhas(linhas.filter((_, k) => k !== i))}>Tirar</button>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={3}>Total</td><td className="num">{fmtMoeda(total)}</td><td /></tr></tfoot>
        </table>
      </div>
      <button type="button" className="btn btn-peq" onClick={() => setLinhas([...linhas, { produtoId: '', quantidade: '', custo: '' }])}>+ Outro produto</button>
      <div className="secao-form" style={{ marginTop: '1.25rem' }}>Pagamento</div>
      <div className="form-grade-3">
        <Campo rotulo="Como foi pago">
          <select value={cab.modo} onChange={(e) => setCab({ ...cab, modo: e.target.value })}><option value="agora">Pago agora (sai do caixa)</option><option value="prazo">A prazo (vira conta a pagar)</option></select>
        </Campo>
        {cab.modo === 'agora' ? <>
          <Campo rotulo="Saiu de"><select value={cab.conta} onChange={(e) => setCab({ ...cab, conta: e.target.value })}>{config.contasFinanceiras.map((c) => <option key={c}>{c}</option>)}</select></Campo>
          <Campo rotulo="Forma"><select value={cab.forma} onChange={(e) => setCab({ ...cab, forma: e.target.value })}>{FORMAS_PAGAMENTO.map((f) => <option key={f}>{f}</option>)}</select></Campo>
        </> : <Campo rotulo="Vencimento"><input type="date" value={cab.vencimento} onChange={(e) => setCab({ ...cab, vencimento: e.target.value })} /></Campo>}
      </div>
    </ModalForm>
  );
}

// =================== Relatório ===================
function AbaRelatorio() {
  const { entidadeId, entidade, papel } = useAuth();
  const [de, setDe] = useState(`${hoje().slice(0, 7)}-01`);
  const [ate, setAte] = useState(hoje());
  const movs = useColecao(entidadeId, 'movEstoque', [where('data', '>=', de), where('data', '<=', ate)], `${de}${ate}`);
  const verCusto = papel !== 'copa';

  const linhas = useMemo(() => {
    const g = {};
    movs.dados.forEach((m) => {
      const p = g[m.produtoId] || (g[m.produtoId] = { nome: m.produtoNome, vendidos: 0, receita: 0, custo: 0, perdas: 0, custoPerdas: 0, compras: 0 });
      if (m.tipo === 'venda') { p.vendidos += m.quantidade; p.receita += m.quantidade * num(m.valorUnit); p.custo += m.quantidade * num(m.custoUnit); }
      if (m.tipo === 'perda' || m.tipo === 'consumo') { p.perdas += Math.abs(m.quantidade); p.custoPerdas += Math.abs(m.quantidade) * num(m.custoUnit); }
      if (m.tipo === 'compra') p.compras += m.quantidade;
    });
    return Object.values(g).map((p) => ({ ...p, receita: arred(p.receita), custo: arred(p.custo), lucro: arred(p.receita - p.custo), custoPerdas: arred(p.custoPerdas) }))
      .sort((a, b) => b.receita - a.receita);
  }, [movs.dados]);
  const tot = { receita: somar(linhas, 'receita'), custo: somar(linhas, 'custo'), lucro: somar(linhas, 'lucro'), perdas: somar(linhas, 'custoPerdas') };

  function pdf() {
    relatorioPdf({
      entidade, titulo: 'Relatório da copa', subtitulo: `De ${fmtData(de)} a ${fmtData(ate)}`, paisagem: true,
      resumo: [['Vendas', fmtMoeda(tot.receita)], ['Custo do vendido', fmtMoeda(tot.custo)], ['Lucro', fmtMoeda(tot.lucro)], ['Perdas e cortesias (a custo)', fmtMoeda(tot.perdas)]],
      secoes: [{ colunas: ['Produto', 'Vendidos', 'Vendas', 'Custo', 'Lucro', 'Perdas/cortesia', 'Comprados'],
        linhas: linhas.map((l) => [l.nome, l.vendidos, fmtMoeda(l.receita), fmtMoeda(l.custo), fmtMoeda(l.lucro), l.perdas, l.compras]),
        rodape: ['Total', '', fmtMoeda(tot.receita), fmtMoeda(tot.custo), fmtMoeda(tot.lucro), '', ''], alinharDireita: [1, 2, 3, 4, 5, 6] }],
    });
  }
  function csv() {
    baixarCsv('relatorio-copa', ['Produto', 'Vendidos', 'Vendas', 'Custo', 'Lucro', 'Perdas/cortesia', 'Comprados'],
      linhas.map((l) => [l.nome, l.vendidos, l.receita.toFixed(2).replace('.', ','), l.custo.toFixed(2).replace('.', ','), l.lucro.toFixed(2).replace('.', ','), l.perdas, l.compras]));
  }

  return (
    <>
      <div className="filtros">
        <Campo rotulo="De"><input type="date" value={de} onChange={(e) => e.target.value && setDe(e.target.value)} /></Campo>
        <Campo rotulo="Até"><input type="date" value={ate} onChange={(e) => e.target.value && setAte(e.target.value)} /></Campo>
        <div className="acoes" style={{ marginLeft: 'auto' }}>
          {linhas.length > 0 && <><button type="button" className="btn" onClick={csv}>Planilha</button><button type="button" className="btn btn-primario" onClick={pdf}><Icone nome="pdf" tam={18} />Baixar PDF</button></>}
        </div>
      </div>
      {movs.carregando ? <Carregando /> : !linhas.length ? <Vazio titulo="Nenhum movimento nesse período" /> : (
        <>
          <div className="painel-corpo" style={{ paddingBottom: 0 }}>
            <div className="indicadores" style={{ marginBottom: 0 }}>
              <div className="indicador positivo"><div className="rotulo">Vendas</div><div className="valor">{fmtMoeda(tot.receita)}</div></div>
              {verCusto && <div className="indicador"><div className="rotulo">Custo do vendido</div><div className="valor">{fmtMoeda(tot.custo)}</div></div>}
              {verCusto && <div className="indicador positivo"><div className="rotulo">Lucro</div><div className="valor">{fmtMoeda(tot.lucro)}</div></div>}
              <div className={`indicador ${tot.perdas ? 'alerta' : ''}`}><div className="rotulo">Perdas e cortesias</div><div className="valor">{fmtMoeda(tot.perdas)}</div><div className="detalhe">a preço de custo</div></div>
            </div>
          </div>
          <div className="tabela-wrap">
            <table>
              <thead><tr><th>Produto</th><th className="num">Vendidos</th><th className="num">Vendas</th>{verCusto && <th className="num esconder-mobile">Lucro</th>}<th className="num esconder-mobile">Perdas</th></tr></thead>
              <tbody>{linhas.map((l) => (
                <tr key={l.nome}><td>{l.nome}</td><td className="num">{l.vendidos}</td><td className="num">{fmtMoeda(l.receita)}</td>
                  {verCusto && <td className="num esconder-mobile">{fmtMoeda(l.lucro)}</td>}<td className="num esconder-mobile">{l.perdas || '—'}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
