import { useMemo, useState } from 'react';
import { orderBy } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useColecao, salvar, excluir } from '../lib/db';
import { CATEGORIAS_PATRIMONIO, ESTADOS_PATRIMONIO } from '../lib/constantes';
import { fmtMoeda, fmtData, hoje, somar, normalizar } from '../lib/format';
import { relatorioPdf } from '../lib/pdf';
import { baixarCsv } from '../lib/csv';
import {
  Cabecalho, Campo, Carregando, ErroLeitura, ModalForm, Selo, Vazio, useAcao, useFormulario,
} from '../components/ui';
import Icone from '../components/Icone';

const COR_ESTADO = { Novo: 'ok', Bom: 'ok', Regular: 'pendente', Ruim: 'atraso', Baixado: 'neutro' };

export default function Patrimonio() {
  const { entidadeId, entidade, podeEditar } = useAuth();
  const { dados, carregando, erro } = useColecao(entidadeId, 'patrimonio', [orderBy('descricao')]);
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [mostrarBaixados, setMostrarBaixados] = useState(false);
  const [soEmprestados, setSoEmprestados] = useState(false);
  const [editando, setEditando] = useState(null);
  const editar = podeEditar('patrimonio');

  const lista = useMemo(() => {
    const b = normalizar(busca);
    return dados.filter((p) => (mostrarBaixados || p.estado !== 'Baixado')
      && (!categoria || p.categoria === categoria)
      && (!soEmprestados || p.emprestadoPara)
      && (!b || normalizar(`${p.descricao} ${p.tombo} ${p.localizacao} ${p.emprestadoPara}`).includes(b)));
  }, [dados, busca, categoria, mostrarBaixados, soEmprestados]);

  const ativos = dados.filter((p) => p.estado !== 'Baixado');
  const emprestados = ativos.filter((p) => p.emprestadoPara);
  const atrasados = emprestados.filter((p) => p.devolucaoPrevista && p.devolucaoPrevista < hoje());
  const valorTotal = somar(ativos.map((p) => ({ valor: (Number(p.valor) || 0) * (Number(p.quantidade) || 1) })));
  const totalItem = (p) => (Number(p.valor) || 0) * (Number(p.quantidade) || 1);

  function exportarPdf() {
    relatorioPdf({
      entidade, titulo: 'Inventário de patrimônio', paisagem: true,
      resumo: [['Itens ativos', ativos.length], ['Valor estimado', fmtMoeda(valorTotal)]],
      secoes: [{
        colunas: ['Tombo', 'Descrição', 'Categoria', 'Qtd.', 'Estado', 'Localização', 'Com quem', 'Valor'],
        linhas: lista.map((p) => [p.tombo || '', p.descricao, p.categoria, p.quantidade || 1, p.estado, p.localizacao || '', p.emprestadoPara || '', fmtMoeda(totalItem(p))]),
        rodape: ['', 'Total', '', '', '', '', '', fmtMoeda(lista.reduce((s, p) => s + totalItem(p), 0))],
        alinharDireita: [3, 7],
      }],
    });
  }
  function exportarCsv() {
    baixarCsv('patrimonio', ['Tombo', 'Descrição', 'Categoria', 'Quantidade', 'Estado', 'Valor unitário', 'Aquisição', 'Localização', 'Emprestado para', 'Devolução prevista', 'Observações'],
      lista.map((p) => [p.tombo, p.descricao, p.categoria, p.quantidade || 1, p.estado, p.valor, fmtData(p.dataAquisicao), p.localizacao, p.emprestadoPara, fmtData(p.devolucaoPrevista), p.observacoes]));
  }

  return (
    <>
      <Cabecalho titulo="Patrimônio" descricao="Pilchas, instrumentos, som, cozinha e tudo que é da entidade, inclusive o que está emprestado.">
        <button type="button" className="btn" onClick={exportarCsv}>Planilha</button>
        <button type="button" className="btn" onClick={exportarPdf}><Icone nome="pdf" tam={18} />Inventário</button>
        {editar && <button type="button" className="btn btn-primario" onClick={() => setEditando({})}><Icone nome="mais" tam={18} />Novo item</button>}
      </Cabecalho>
      <div className="indicadores">
        <div className="indicador"><div className="rotulo">Itens ativos</div><div className="valor">{ativos.length}</div></div>
        <div className="indicador"><div className="rotulo">Valor estimado</div><div className="valor">{fmtMoeda(valorTotal)}</div></div>
        <div className={`indicador ${atrasados.length ? 'alerta' : ''}`}><div className="rotulo">Emprestados</div><div className="valor">{emprestados.length}</div>
          {atrasados.length > 0 && <div className="detalhe">{atrasados.length} com devolução atrasada</div>}</div>
      </div>
      <ErroLeitura erro={erro} />
      <div className="painel">
        <div className="filtros">
          <div className="campo"><label htmlFor="bp">Buscar</label><input id="bp" type="search" placeholder="Descrição, tombo, local ou pessoa" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
          <div className="campo"><label htmlFor="cp">Categoria</label>
            <select id="cp" value={categoria} onChange={(e) => setCategoria(e.target.value)}><option value="">Todas</option>{CATEGORIAS_PATRIMONIO.map((c) => <option key={c}>{c}</option>)}</select>
          </div>
          <label className="checkbox"><input type="checkbox" checked={soEmprestados} onChange={(e) => setSoEmprestados(e.target.checked)} />Só emprestados</label>
          <label className="checkbox"><input type="checkbox" checked={mostrarBaixados} onChange={(e) => setMostrarBaixados(e.target.checked)} />Mostrar baixados</label>
        </div>
        {carregando ? <Carregando /> : lista.length === 0 ? (
          <Vazio titulo={dados.length ? 'Nenhum item com esses filtros' : 'Nenhum bem cadastrado'}>
            {!dados.length && editar && <button type="button" className="btn btn-primario" onClick={() => setEditando({})}>Cadastrar o primeiro item</button>}
          </Vazio>
        ) : (
          <div className="tabela-wrap">
            <table>
              <thead><tr><th className="esconder-mobile">Tombo</th><th>Item</th><th className="esconder-mobile">Localização</th><th>Estado</th><th className="num">Valor</th></tr></thead>
              <tbody>
                {lista.map((p) => (
                  <tr key={p.id} className={editar ? 'clicavel' : ''} onClick={() => editar && setEditando(p)}>
                    <td className="esconder-mobile">{p.tombo || '—'}</td>
                    <td><strong>{p.descricao}</strong>{Number(p.quantidade) > 1 && ` (${p.quantidade} un.)`}
                      <span className="sub">{p.categoria}{p.emprestadoPara && ` — com ${p.emprestadoPara}${p.devolucaoPrevista ? ` até ${fmtData(p.devolucaoPrevista)}` : ''}`}</span></td>
                    <td className="esconder-mobile">{p.localizacao || '—'}</td>
                    <td><Selo tipo={COR_ESTADO[p.estado]}>{p.estado}</Selo>{p.devolucaoPrevista && p.emprestadoPara && p.devolucaoPrevista < hoje() && <> <Selo tipo="atraso">devolução atrasada</Selo></>}</td>
                    <td className="num">{fmtMoeda(totalItem(p))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editando && <FormItem item={editando} aoFechar={() => setEditando(null)} />}
    </>
  );
}

function FormItem({ item, aoFechar }) {
  const { entidadeId } = useAuth();
  const acao = useAcao();
  const novo = !item.id;
  const { dados, ligar, setDados } = useFormulario({ categoria: CATEGORIAS_PATRIMONIO[0], estado: 'Bom', quantidade: 1, valor: '', ...item });

  function gravar() {
    return acao(() => salvar(entidadeId, 'patrimonio', item.id, {
      ...dados, descricao: dados.descricao.trim(), valor: dados.valor === '' ? 0 : Number(dados.valor), quantidade: Number(dados.quantidade) || 1,
    }), novo ? 'Item cadastrado' : 'Item atualizado');
  }
  async function remover() {
    if (!window.confirm(`Excluir "${item.descricao}"? Para itens que saíram do patrimônio, prefira o estado "Baixado" (mantém o histórico).`)) return;
    if (await acao(() => excluir(entidadeId, 'patrimonio', item.id), 'Item excluído')) aoFechar();
  }

  return (
    <ModalForm titulo={novo ? 'Novo item de patrimônio' : `Editar ${item.descricao}`} aoFechar={aoFechar} aoSalvar={gravar}
      extraRodape={!novo && <button type="button" className="btn btn-perigo" onClick={remover}>Excluir</button>}>
      <div className="form-grade">
        <Campo rotulo="Descrição" className="col-2"><input placeholder="Vestido de prenda azul, tamanho 12" {...ligar('descricao', { obrigatorio: true })} autoFocus /></Campo>
        <Campo rotulo="Categoria"><select {...ligar('categoria')}>{CATEGORIAS_PATRIMONIO.map((c) => <option key={c}>{c}</option>)}</select></Campo>
        <Campo rotulo="Nº de tombo / etiqueta"><input {...ligar('tombo')} /></Campo>
        <Campo rotulo="Quantidade"><input type="number" min="1" {...ligar('quantidade')} /></Campo>
        <Campo rotulo="Valor unitário estimado (R$)"><input type="number" step="0.01" min="0" {...ligar('valor')} /></Campo>
        <Campo rotulo="Estado"><select {...ligar('estado')}>{ESTADOS_PATRIMONIO.map((c) => <option key={c}>{c}</option>)}</select></Campo>
        <Campo rotulo="Data de aquisição"><input type="date" {...ligar('dataAquisicao')} /></Campo>
        <Campo rotulo="Localização" className="col-2"><input placeholder="Sala da invernada, armário 2" {...ligar('localizacao')} /></Campo>
        <div className="secao-form">Empréstimo</div>
        <Campo rotulo="Emprestado para" ajuda="Deixe em branco se está no galpão"><input {...ligar('emprestadoPara')} /></Campo>
        <Campo rotulo="Devolução prevista"><input type="date" {...ligar('devolucaoPrevista')} /></Campo>
        {dados.emprestadoPara && <div className="col-2" style={{ marginBottom: '1rem' }}><button type="button" className="btn btn-peq" onClick={() => setDados({ ...dados, emprestadoPara: '', devolucaoPrevista: '' })}>Marcar como devolvido</button></div>}
        <Campo rotulo="Observações" className="col-2"><textarea {...ligar('observacoes')} /></Campo>
      </div>
    </ModalForm>
  );
}
