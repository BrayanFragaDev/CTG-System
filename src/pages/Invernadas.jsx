import { useMemo, useState } from 'react';
import { orderBy } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useColecao, salvar, excluir } from '../lib/db';
import { CATEGORIAS_INVERNADA } from '../lib/constantes';
import { fmtData, hoje, idade, normalizar } from '../lib/format';
import { relatorioPdf } from '../lib/pdf';
import {
  Cabecalho, Campo, Carregando, ErroLeitura, Modal, ModalForm, Selo, Vazio, useAcao, useFormulario,
} from '../components/ui';
import Icone from '../components/Icone';

const FUNCOES = ['Prenda', 'Peão', 'Gaiteiro', 'Violonista', 'Percussionista', 'Cantor', 'Declamador', 'Posteiro', 'Instrutor', 'Ensaiador', 'Coordenador', 'Outro'];

export default function Invernadas() {
  const { entidadeId, podeEditar } = useAuth();
  const { dados, carregando, erro } = useColecao(entidadeId, 'invernadas', [orderBy('nome')]);
  const socios = useColecao(entidadeId, 'socios', [orderBy('nome')]);
  const [editando, setEditando] = useState(null);
  const [aberta, setAberta] = useState(null);
  const editar = podeEditar('invernadas');

  return (
    <>
      <Cabecalho titulo="Invernadas" descricao="Grupos artísticos, seus integrantes e a trajetória em rodeios e concursos.">
        {editar && <button type="button" className="btn btn-primario" onClick={() => setEditando({})}><Icone nome="mais" tam={18} />Nova invernada</button>}
      </Cabecalho>
      <ErroLeitura erro={erro} />
      <div className="painel">
        {carregando ? <Carregando /> : dados.length === 0 ? (
          <Vazio titulo="Nenhuma invernada cadastrada">
            {editar && <button type="button" className="btn btn-primario" onClick={() => setEditando({})}>Cadastrar a primeira invernada</button>}
          </Vazio>
        ) : (
          <div className="tabela-wrap">
            <table>
              <thead><tr><th>Invernada</th><th className="esconder-mobile">Instrutor</th><th className="esconder-mobile">Ensaios</th><th className="num">Integrantes</th></tr></thead>
              <tbody>
                {dados.map((i) => (
                  <tr key={i.id} className="clicavel" onClick={() => setAberta(i.id)}>
                    <td><strong>{i.nome}</strong><span className="sub">{i.categoria}</span></td>
                    <td className="esconder-mobile">{i.instrutor || '—'}</td>
                    <td className="esconder-mobile">{i.ensaios || '—'}</td>
                    <td className="num">{(i.integrantes || []).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editando && <FormInvernada inv={editando} aoFechar={() => setEditando(null)} />}
      {aberta && dados.find((i) => i.id === aberta) && (
        <DetalheInvernada inv={dados.find((i) => i.id === aberta)} socios={socios.dados} editar={editar}
          aoFechar={() => setAberta(null)} aoEditar={() => { setEditando(dados.find((i) => i.id === aberta)); setAberta(null); }} />
      )}
    </>
  );
}

function FormInvernada({ inv, aoFechar }) {
  const { entidadeId } = useAuth();
  const acao = useAcao();
  const novo = !inv.id;
  const { dados, ligar } = useFormulario({ categoria: 'Adulta', integrantes: [], participacoes: [], ...inv });

  function gravar() {
    const { integrantes, participacoes, ...resto } = dados;
    return acao(() => salvar(entidadeId, 'invernadas', inv.id, novo ? { ...resto, integrantes: [], participacoes: [] } : resto), novo ? 'Invernada cadastrada' : 'Invernada atualizada');
  }
  async function remover() {
    if (!window.confirm(`Excluir a invernada "${inv.nome}"? Os sócios continuam cadastrados.`)) return;
    if (await acao(() => excluir(entidadeId, 'invernadas', inv.id), 'Invernada excluída')) aoFechar();
  }

  return (
    <ModalForm titulo={novo ? 'Nova invernada' : `Editar ${inv.nome}`} aoFechar={aoFechar} aoSalvar={gravar}
      extraRodape={!novo && <button type="button" className="btn btn-perigo" onClick={remover}>Excluir</button>}>
      <div className="form-grade">
        <Campo rotulo="Nome" className="col-2"><input placeholder="Invernada Artística Juvenil" {...ligar('nome', { obrigatorio: true })} autoFocus /></Campo>
        <Campo rotulo="Categoria"><select {...ligar('categoria')}>{CATEGORIAS_INVERNADA.map((c) => <option key={c}>{c}</option>)}</select></Campo>
        <Campo rotulo="Instrutor / coreógrafo"><input {...ligar('instrutor')} /></Campo>
        <Campo rotulo="Ensaiador"><input {...ligar('ensaiador')} /></Campo>
        <Campo rotulo="Coordenador"><input {...ligar('coordenador')} /></Campo>
        <Campo rotulo="Dias e horários de ensaio" className="col-2"><input placeholder="Terças e quintas, 19h30" {...ligar('ensaios')} /></Campo>
        <Campo rotulo="Observações" className="col-2"><textarea {...ligar('observacoes')} /></Campo>
      </div>
    </ModalForm>
  );
}

function DetalheInvernada({ inv, socios, editar, aoFechar, aoEditar }) {
  const { entidadeId, entidade } = useAuth();
  const acao = useAcao();
  const [busca, setBusca] = useState('');
  const [funcao, setFuncao] = useState('Prenda');
  const [part, setPart] = useState(false);
  const integrantes = inv.integrantes || [];
  const mapa = useMemo(() => Object.fromEntries(socios.map((s) => [s.id, s])), [socios]);
  const ids = new Set(integrantes.map((i) => i.socioId));
  const candidatos = busca.length < 2 ? [] : socios
    .filter((s) => !ids.has(s.id) && s.situacao !== 'Falecido' && normalizar(s.nome).includes(normalizar(busca))).slice(0, 8);

  const linhas = integrantes.map((i) => ({ ...i, s: mapa[i.socioId] || { nome: i.nome } }))
    .sort((a, b) => a.funcao.localeCompare(b.funcao) || a.s.nome.localeCompare(b.s.nome));

  const gravarIntegrantes = (lista, msg) => acao(() => salvar(entidadeId, 'invernadas', inv.id, { integrantes: lista }), msg);
  const adicionar = (s) => { gravarIntegrantes([...integrantes, { socioId: s.id, nome: s.nome, funcao }], `${s.nome} entrou na invernada`); setBusca(''); };
  const remover = (id) => gravarIntegrantes(integrantes.filter((i) => i.socioId !== id), 'Integrante removido');
  const mudarFuncao = (id, f) => gravarIntegrantes(integrantes.map((i) => (i.socioId === id ? { ...i, funcao: f } : i)));
  const removerPart = (idx) => window.confirm('Remover esta participação?')
    && acao(() => salvar(entidadeId, 'invernadas', inv.id, { participacoes: (inv.participacoes || []).filter((_, i) => i !== idx) }), 'Participação removida');

  function exportarPdf() {
    relatorioPdf({
      entidade, titulo: `Relação de integrantes — ${inv.nome}`, subtitulo: `${inv.categoria}${inv.instrutor ? `, instrutor ${inv.instrutor}` : ''}`,
      secoes: [{
        colunas: ['Nome', 'Função', 'Nascimento', 'Idade', 'CPF', 'Cartão MTG'],
        linhas: linhas.map((l) => [l.s.nome, l.funcao, fmtData(l.s.nascimento), idade(l.s.nascimento) ?? '', l.s.cpf || '', l.s.carteiraMtg || '']),
      }],
    });
  }

  return (
    <>
      <Modal largo titulo={inv.nome} aoFechar={aoFechar} rodape={<>
        <button type="button" className="btn" onClick={exportarPdf}><Icone nome="pdf" tam={18} />Relação de integrantes</button>
        {editar && <button type="button" className="btn btn-primario" onClick={aoEditar}>Editar dados</button>}
      </>}>
        <dl className="ficha">
          <div><dt>Categoria</dt><dd>{inv.categoria}</dd></div>
          <div><dt>Instrutor</dt><dd>{inv.instrutor || '—'}</dd></div>
          <div><dt>Ensaiador</dt><dd>{inv.ensaiador || '—'}</dd></div>
          <div><dt>Ensaios</dt><dd>{inv.ensaios || '—'}</dd></div>
        </dl>

        <h3 style={{ margin: '1.5rem 0 .5rem' }}>Integrantes ({integrantes.length})</h3>
        {editar && (
          <div className="form-grade" style={{ alignItems: 'end' }}>
            <Campo rotulo="Adicionar sócio"><input type="search" placeholder="Digite o nome" value={busca} onChange={(e) => setBusca(e.target.value)} /></Campo>
            <Campo rotulo="Função"><select value={funcao} onChange={(e) => setFuncao(e.target.value)}>{FUNCOES.map((f) => <option key={f}>{f}</option>)}</select></Campo>
          </div>
        )}
        {candidatos.length > 0 && (
          <ul className="lista-simples" style={{ marginBottom: '1rem', border: '1px solid var(--linha)', borderRadius: 6, padding: '0 .75rem' }}>
            {candidatos.map((s) => (
              <li key={s.id}><span>{s.nome}{s.nascimento && <span className="sub" style={{ display: 'inline', marginLeft: '.5rem' }}>{idade(s.nascimento)} anos</span>}</span>
                <button type="button" className="btn btn-peq" onClick={() => adicionar(s)}>Adicionar como {funcao.toLowerCase()}</button></li>
            ))}
          </ul>
        )}
        {busca.length >= 2 && !candidatos.length && <p className="sub">Nenhum sócio encontrado. Cadastre a pessoa em Sócios primeiro.</p>}
        {linhas.length === 0 ? <p className="sub">Nenhum integrante ainda.</p> : (
          <div className="tabela-wrap" style={{ border: '1px solid var(--linha)', borderRadius: 6 }}>
            <table>
              <thead><tr><th>Nome</th><th>Função</th><th className="num esconder-mobile">Idade</th><th className="esconder-mobile">Cartão MTG</th>{editar && <th />}</tr></thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.socioId}>
                    <td>{l.s.nome}{l.s.situacao && l.s.situacao !== 'Ativo' && <> <Selo>{l.s.situacao}</Selo></>}</td>
                    <td>{editar ? <select value={l.funcao} onChange={(e) => mudarFuncao(l.socioId, e.target.value)} aria-label="Função">{FUNCOES.map((f) => <option key={f}>{f}</option>)}</select> : l.funcao}</td>
                    <td className="num esconder-mobile">{idade(l.s.nascimento) ?? '—'}</td>
                    <td className="esconder-mobile">{l.s.carteiraMtg || <Selo tipo="pendente">sem cartão</Selo>}</td>
                    {editar && <td className="acoes-celula"><button type="button" className="btn-link" onClick={() => remover(l.socioId)}>Remover</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '1.5rem 0 .5rem' }}>
          <h3>Participações e premiações</h3>
          {editar && <button type="button" className="btn btn-peq" onClick={() => setPart(true)}>+ Participação</button>}
        </div>
        {(inv.participacoes || []).length === 0 ? <p className="sub">Nenhuma participação registrada.</p> : (
          <ul className="lista-simples">
            {[...(inv.participacoes || [])].map((p, idx) => ({ ...p, idx })).sort((a, b) => b.data.localeCompare(a.data)).map((p) => (
              <li key={p.idx}>
                <span><strong>{p.evento}</strong><span className="sub">{fmtData(p.data)}{p.modalidade ? `, ${p.modalidade}` : ''}</span></span>
                <span style={{ textAlign: 'right' }}>{p.resultado && <Selo tipo="ok">{p.resultado}</Selo>}
                  {editar && <button type="button" className="btn-link" onClick={() => removerPart(p.idx)}>Remover</button>}</span>
              </li>
            ))}
          </ul>
        )}
      </Modal>
      {part && <FormParticipacao inv={inv} aoFechar={() => setPart(false)} />}
    </>
  );
}

function FormParticipacao({ inv, aoFechar }) {
  const { entidadeId } = useAuth();
  const acao = useAcao();
  const { dados, ligar } = useFormulario({ data: hoje(), evento: '', modalidade: '', resultado: '' });
  return (
    <ModalForm titulo="Registrar participação" aoFechar={aoFechar}
      aoSalvar={() => acao(() => salvar(entidadeId, 'invernadas', inv.id, { participacoes: [...(inv.participacoes || []), dados] }), 'Participação registrada')}>
      <div className="form-grade">
        <Campo rotulo="Evento / rodeio / concurso" className="col-2"><input placeholder="ENART — fase regional" {...ligar('evento', { obrigatorio: true })} autoFocus /></Campo>
        <Campo rotulo="Data"><input type="date" {...ligar('data', { obrigatorio: true })} /></Campo>
        <Campo rotulo="Modalidade"><input placeholder="Danças tradicionais" {...ligar('modalidade')} /></Campo>
        <Campo rotulo="Resultado / colocação" className="col-2"><input placeholder="2º lugar, classificada para a final" {...ligar('resultado')} /></Campo>
      </div>
    </ModalForm>
  );
}
