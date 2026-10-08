import { useEffect, useMemo, useState } from 'react';
import { orderBy, where } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useColecao, salvar, excluir, buscar } from '../lib/db';
import { SITUACOES_SOCIO } from '../lib/constantes';
import { fmtData, fmtMoeda, fmtCompetencia, hoje, idade, normalizar, mascaraCpf, mascaraTelefone } from '../lib/format';
import { relatorioPdf, fichaSocioPdf } from '../lib/pdf';
import { baixarCsv } from '../lib/csv';
import {
  Cabecalho, Campo, Carregando, ErroLeitura, Modal, ModalForm, Selo, Vazio, useAcao, useFormulario,
} from '../components/ui';
import Icone from '../components/Icone';

export const corSituacao = { Ativo: 'ok', Licenciado: 'pendente', Inativo: 'neutro', Falecido: 'neutro' };

export function valorMensalidadeSocio(socio, config) {
  if (socio.valorMensalidade !== '' && socio.valorMensalidade != null) return Number(socio.valorMensalidade);
  return Number(config.categoriasSocio.find((c) => c.nome === socio.categoria)?.valor || 0);
}

export default function Socios() {
  const { entidadeId, entidade, config, podeEditar } = useAuth();
  const { dados: socios, carregando, erro } = useColecao(entidadeId, 'socios', [orderBy('nome')]);
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('Ativo');
  const [categoria, setCategoria] = useState('');
  const [editando, setEditando] = useState(null);
  const [ficha, setFicha] = useState(null);
  const editar = podeEditar('socios');

  const filtrados = useMemo(() => {
    const b = normalizar(busca);
    return socios.filter((s) =>
      (!situacao || s.situacao === situacao)
      && (!categoria || s.categoria === categoria)
      && (!b || normalizar(`${s.nome} ${s.matricula} ${s.cpf} ${s.telefone} ${s.email}`).includes(b)));
  }, [socios, busca, situacao, categoria]);

  const proximaMatricula = useMemo(
    () => socios.reduce((m, s) => Math.max(m, Number(s.matricula) || 0), 0) + 1, [socios]);

  function exportarPdf() {
    relatorioPdf({
      entidade, titulo: 'Quadro social',
      subtitulo: `${filtrados.length} sócio(s)${situacao ? ` — situação: ${situacao}` : ''}${categoria ? ` — ${categoria}` : ''}`,
      paisagem: true,
      secoes: [{
        colunas: ['Matr.', 'Nome', 'Categoria', 'Situação', 'Nascimento', 'Telefone', 'E-mail', 'Admissão'],
        linhas: filtrados.map((s) => [s.matricula, s.nome, s.categoria, s.situacao, fmtData(s.nascimento), s.telefone, s.email, fmtData(s.dataAdmissao)]),
      }],
    });
  }
  function exportarCsv() {
    baixarCsv('socios', ['Matrícula', 'Nome', 'CPF', 'RG', 'Nascimento', 'Sexo', 'Telefone', 'E-mail', 'Endereço', 'Bairro', 'Cidade', 'CEP', 'Categoria', 'Situação', 'Admissão', 'Cartão MTG', 'Observações'],
      filtrados.map((s) => [s.matricula, s.nome, s.cpf, s.rg, fmtData(s.nascimento), s.sexo, s.telefone, s.email, s.endereco, s.bairro, s.cidade, s.cep, s.categoria, s.situacao, fmtData(s.dataAdmissao), s.carteiraMtg, s.observacoes]));
  }

  return (
    <>
      <Cabecalho titulo="Sócios" descricao={`${socios.filter((s) => s.situacao === 'Ativo').length} ativos de ${socios.length} cadastrados`}>
        <button type="button" className="btn" onClick={exportarCsv}>Planilha</button>
        <button type="button" className="btn" onClick={exportarPdf}><Icone nome="pdf" tam={18} />PDF</button>
        {editar && <button type="button" className="btn btn-primario" onClick={() => setEditando({})}><Icone nome="mais" tam={18} />Novo sócio</button>}
      </Cabecalho>
      <ErroLeitura erro={erro} />
      <div className="painel">
        <div className="filtros">
          <div className="campo">
            <label htmlFor="busca-socio">Buscar</label>
            <input id="busca-socio" type="search" placeholder="Nome, matrícula, CPF ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <div className="campo">
            <label htmlFor="f-sit">Situação</label>
            <select id="f-sit" value={situacao} onChange={(e) => setSituacao(e.target.value)}>
              <option value="">Todas</option>
              {SITUACOES_SOCIO.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="f-cat">Categoria</label>
            <select id="f-cat" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Todas</option>
              {config.categoriasSocio.map((c) => <option key={c.nome}>{c.nome}</option>)}
            </select>
          </div>
        </div>
        {carregando ? <Carregando /> : filtrados.length === 0 ? (
          <Vazio titulo={socios.length ? 'Nenhum sócio encontrado com esses filtros' : 'Nenhum sócio cadastrado ainda'}>
            {!socios.length && editar && <button type="button" className="btn btn-primario" onClick={() => setEditando({})}>Cadastrar o primeiro sócio</button>}
          </Vazio>
        ) : (
          <div className="tabela-wrap">
            <table>
              <thead><tr>
                <th className="num">Matr.</th><th>Nome</th><th className="esconder-mobile">Telefone</th>
                <th className="esconder-mobile num">Idade</th><th className="num esconder-mobile">Mensalidade</th><th>Situação</th>
              </tr></thead>
              <tbody>
                {filtrados.map((s) => (
                  <tr key={s.id} className="clicavel" onClick={() => setFicha(s)}>
                    <td className="num">{s.matricula}</td>
                    <td><strong>{s.nome}</strong><span className="sub">{s.categoria}{s.titularNome ? ` de ${s.titularNome}` : ''}</span></td>
                    <td className="esconder-mobile">{s.telefone || '—'}</td>
                    <td className="esconder-mobile num">{idade(s.nascimento) ?? '—'}</td>
                    <td className="num esconder-mobile">{fmtMoeda(valorMensalidadeSocio(s, config))}</td>
                    <td><Selo tipo={corSituacao[s.situacao]}>{s.situacao}</Selo></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editando && (
        <FormSocio socio={editando} socios={socios} proximaMatricula={proximaMatricula}
          aoFechar={() => setEditando(null)} />
      )}
      {ficha && (
        <FichaSocio socio={socios.find((s) => s.id === ficha.id) || ficha} socios={socios}
          aoFechar={() => setFicha(null)}
          aoEditar={editar ? (s) => { setFicha(null); setEditando(s); } : null} />
      )}
    </>
  );
}

function FormSocio({ socio, socios, proximaMatricula, aoFechar }) {
  const { entidadeId, config } = useAuth();
  const acao = useAcao();
  const novo = !socio.id;
  const { dados, ligar } = useFormulario({
    matricula: proximaMatricula, situacao: 'Ativo', categoria: config.categoriasSocio[0]?.nome,
    dataAdmissao: hoje(), cidade: '', valorMensalidade: '', ...socio,
  });
  const titulares = socios.filter((s) => s.id !== socio.id && !s.titularId && s.situacao !== 'Falecido');

  async function gravar() {
    if (dados.cpf && socios.some((s) => s.id !== socio.id && s.cpf && s.cpf === dados.cpf)) {
      throw new Error('Já existe um sócio com este CPF.');
    }
    const titular = socios.find((s) => s.id === dados.titularId);
    await salvar(entidadeId, 'socios', socio.id, {
      ...dados,
      nome: dados.nome.trim(),
      matricula: Number(dados.matricula) || dados.matricula,
      titularId: dados.titularId || null,
      titularNome: titular?.nome || null,
      valorMensalidade: dados.valorMensalidade === '' ? '' : Number(dados.valorMensalidade),
    });
  }

  async function remover() {
    if (!window.confirm(`Excluir ${socio.nome} do cadastro? As mensalidades já lançadas continuam no histórico.\n\nSe a pessoa apenas saiu da entidade, prefira mudar a situação para "Inativo".`)) return;
    if (await acao(() => excluir(entidadeId, 'socios', socio.id), 'Sócio excluído')) aoFechar();
  }

  return (
    <ModalForm largo titulo={novo ? 'Novo sócio' : `Editar ${socio.nome}`} aoFechar={aoFechar}
      aoSalvar={() => acao(gravar, novo ? 'Sócio cadastrado' : 'Cadastro atualizado').then((ok) => ok)}
      extraRodape={!novo && <button type="button" className="btn btn-perigo" onClick={remover}>Excluir</button>}>
      <div className="form-grade-3">
        <div className="secao-form">Identificação</div>
        <Campo rotulo="Nome completo" className="col-2"><input {...ligar('nome', { obrigatorio: true })} autoFocus /></Campo>
        <Campo rotulo="Matrícula"><input {...ligar('matricula')} /></Campo>
        <Campo rotulo="CPF"><input inputMode="numeric" {...ligar('cpf', { mascara: mascaraCpf })} /></Campo>
        <Campo rotulo="RG"><input {...ligar('rg')} /></Campo>
        <Campo rotulo="Nascimento"><input type="date" {...ligar('nascimento')} /></Campo>
        <Campo rotulo="Sexo">
          <select {...ligar('sexo')}><option value="">—</option><option>Feminino</option><option>Masculino</option></select>
        </Campo>
        <Campo rotulo="Cartão tradicionalista (MTG)"><input {...ligar('carteiraMtg')} /></Campo>

        <div className="secao-form">Contato</div>
        <Campo rotulo="Telefone / WhatsApp"><input inputMode="tel" {...ligar('telefone', { mascara: mascaraTelefone })} /></Campo>
        <Campo rotulo="E-mail" className="col-2"><input type="email" {...ligar('email')} /></Campo>
        <Campo rotulo="Endereço" className="col-2"><input {...ligar('endereco')} /></Campo>
        <Campo rotulo="Bairro"><input {...ligar('bairro')} /></Campo>
        <Campo rotulo="Cidade" className="col-2"><input {...ligar('cidade')} /></Campo>
        <Campo rotulo="CEP"><input inputMode="numeric" {...ligar('cep')} /></Campo>

        <div className="secao-form">Vínculo com a entidade</div>
        <Campo rotulo="Categoria">
          <select {...ligar('categoria')}>{config.categoriasSocio.map((c) => <option key={c.nome} value={c.nome}>{c.nome} — {fmtMoeda(c.valor)}</option>)}</select>
        </Campo>
        <Campo rotulo="Situação"><select {...ligar('situacao')}>{SITUACOES_SOCIO.map((s) => <option key={s}>{s}</option>)}</select></Campo>
        <Campo rotulo="Data de admissão"><input type="date" {...ligar('dataAdmissao')} /></Campo>
        <Campo rotulo="Dependente de" ajuda="Deixe em branco se for titular">
          <select {...ligar('titularId')}>
            <option value="">— é titular —</option>
            {titulares.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Mensalidade própria (R$)" ajuda="Em branco usa o valor da categoria">
          <input type="number" step="0.01" min="0" {...ligar('valorMensalidade')} />
        </Campo>
        <div className="campo"><span className="campo-rotulo">Isento de mensalidade</span>
          <label className="checkbox"><input type="checkbox" checked={Boolean(dados.isento)} onChange={ligar('isento').onChange} />Não gerar mensalidades</label>
        </div>
        <Campo rotulo="Observações" className="col-3"><textarea {...ligar('observacoes')} /></Campo>
      </div>
    </ModalForm>
  );
}

function FichaSocio({ socio: s, socios, aoFechar, aoEditar }) {
  const { entidadeId, entidade, config, pode } = useAuth();
  const [mens, setMens] = useState(null);
  const dependentes = socios.filter((d) => d.titularId === s.id);
  const verFinanceiro = pode('mensalidades');

  useEffect(() => {
    if (!verFinanceiro) return undefined;
    let vivo = true;
    buscar(entidadeId, 'mensalidades', where('socioId', '==', s.id))
      .then((l) => vivo && setMens(l.sort((a, b) => b.competencia.localeCompare(a.competencia))))
      .catch(() => vivo && setMens([]));
    return () => { vivo = false; };
  }, [entidadeId, s.id, verFinanceiro]);
  const abertas = (mens || []).filter((m) => m.status === 'aberto');
  const atrasadas = abertas.filter((m) => m.vencimento < hoje());

  return (
    <Modal largo titulo={s.nome} aoFechar={aoFechar} rodape={<>
      <button type="button" className="btn" onClick={() => fichaSocioPdf(entidade, s, dependentes)}><Icone nome="pdf" tam={18} />Ficha em PDF</button>
      {aoEditar && <button type="button" className="btn btn-primario" onClick={() => aoEditar(s)}>Editar cadastro</button>}
    </>}>
      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <Selo tipo={corSituacao[s.situacao]}>{s.situacao}</Selo>
        <Selo>{s.categoria}</Selo>
        {s.isento && <Selo tipo="info">Isento</Selo>}
        {atrasadas.length > 0 && <Selo tipo="atraso">{atrasadas.length} mensalidade(s) em atraso</Selo>}
      </div>
      <dl className="ficha">
        <div><dt>Matrícula</dt><dd>{s.matricula || '—'}</dd></div>
        <div><dt>CPF</dt><dd>{s.cpf || '—'}</dd></div>
        <div><dt>Nascimento</dt><dd>{fmtData(s.nascimento)}{s.nascimento && ` (${idade(s.nascimento)} anos)`}</dd></div>
        <div><dt>Telefone</dt><dd>{s.telefone ? <a href={`https://wa.me/55${s.telefone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">{s.telefone}</a> : '—'}</dd></div>
        <div><dt>E-mail</dt><dd>{s.email || '—'}</dd></div>
        <div><dt>Admissão</dt><dd>{fmtData(s.dataAdmissao)}</dd></div>
        <div><dt>Mensalidade</dt><dd>{s.isento ? 'Isento' : fmtMoeda(valorMensalidadeSocio(s, config))}</dd></div>
        <div><dt>Cartão MTG</dt><dd>{s.carteiraMtg || '—'}</dd></div>
        <div style={{ gridColumn: '1 / -1' }}><dt>Endereço</dt><dd>{[s.endereco, s.bairro, s.cidade, s.cep].filter(Boolean).join(', ') || '—'}</dd></div>
        {s.titularNome && <div><dt>Dependente de</dt><dd>{s.titularNome}</dd></div>}
        {s.observacoes && <div style={{ gridColumn: '1 / -1' }}><dt>Observações</dt><dd>{s.observacoes}</dd></div>}
      </dl>
      {dependentes.length > 0 && (
        <>
          <h3 style={{ margin: '1.5rem 0 .5rem' }}>Dependentes</h3>
          <ul className="lista-simples">
            {dependentes.map((d) => <li key={d.id}><span>{d.nome}</span><span>{d.categoria}{d.nascimento && `, ${idade(d.nascimento)} anos`}</span></li>)}
          </ul>
        </>
      )}
      {verFinanceiro && (
        <>
          <h3 style={{ margin: '1.5rem 0 .5rem' }}>Mensalidades</h3>
          {mens === null ? <Carregando /> : mens.length === 0 ? <p className="sub">Nenhuma mensalidade lançada.</p> : (
            <div className="tabela-wrap" style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--linha)', borderRadius: 6 }}>
              <table>
                <thead><tr><th>Competência</th><th>Vencimento</th><th className="num">Valor</th><th>Situação</th></tr></thead>
                <tbody>
                  {mens.map((m) => (
                    <tr key={m.id}>
                      <td>{fmtCompetencia(m.competencia)}</td>
                      <td>{fmtData(m.vencimento)}</td>
                      <td className="num">{fmtMoeda(m.valorPago ?? m.valor)}</td>
                      <td>{m.status === 'pago' ? <Selo tipo="ok">Pago em {fmtData(m.dataPagamento)}</Selo>
                        : m.status === 'cancelado' ? <Selo>Cancelada</Selo>
                          : m.vencimento < hoje() ? <Selo tipo="atraso">Em atraso</Selo> : <Selo tipo="pendente">Em aberto</Selo>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {abertas.length > 0 && <p style={{ marginTop: '.6rem' }}>Total em aberto: <strong>{fmtMoeda(abertas.reduce((t, m) => t + Number(m.valor), 0))}</strong></p>}
        </>
      )}
    </Modal>
  );
}
