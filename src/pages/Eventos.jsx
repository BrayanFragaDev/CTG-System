import { useMemo, useState } from 'react';
import { orderBy, where } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useColecao, salvar, excluir } from '../lib/db';
import { TIPOS_EVENTO, FORMAS_PAGAMENTO } from '../lib/constantes';
import { fmtMoeda, fmtData, hoje, somar, arred } from '../lib/format';
import { relatorioPdf } from '../lib/pdf';
import {
  Abas, Cabecalho, Campo, Carregando, ErroLeitura, Modal, ModalForm, Selo, Vazio, useAcao, useFormulario,
} from '../components/ui';
import Icone from '../components/Icone';
import { FormMovimento } from './Caixa';
import { FormConta } from './Contas';

const COR_STATUS = { Planejado: 'pendente', Confirmado: 'info', Realizado: 'ok', Cancelado: 'neutro' };

function categoriaReceita(tipo, categorias) {
  const mapa = { Baile: 'Bailes e fandangos', Fandango: 'Bailes e fandangos', Rodeio: 'Rodeios', 'Jantar / almoço': 'Jantares e almoços' };
  const c = mapa[tipo];
  return categorias.includes(c) ? c : categorias.find((x) => /outras/i.test(x)) || categorias[0];
}

export default function Eventos() {
  const { entidadeId, podeEditar } = useAuth();
  const { dados, carregando, erro } = useColecao(entidadeId, 'eventos', [orderBy('data', 'desc')]);
  const [aba, setAba] = useState('proximos');
  const [editando, setEditando] = useState(null);
  const [aberto, setAberto] = useState(null);
  const editar = podeEditar('eventos');

  const proximos = dados.filter((e) => e.data >= hoje()).sort((a, b) => a.data.localeCompare(b.data));
  const passados = dados.filter((e) => e.data < hoje());
  const lista = aba === 'proximos' ? proximos : passados;

  return (
    <>
      <Cabecalho titulo="Eventos e bailes" descricao="Agenda da entidade e a prestação de contas de cada baile, rodeio ou jantar.">
        {editar && <button type="button" className="btn btn-primario" onClick={() => setEditando({})}><Icone nome="mais" tam={18} />Novo evento</button>}
      </Cabecalho>
      <ErroLeitura erro={erro} />
      <div className="painel">
        <Abas ativa={aba} aoTrocar={setAba} abas={[{ id: 'proximos', rotulo: 'Próximos', contagem: proximos.length }, { id: 'passados', rotulo: 'Realizados', contagem: passados.length }]} />
        {carregando ? <Carregando /> : lista.length === 0 ? (
          <Vazio titulo={aba === 'proximos' ? 'Nenhum evento marcado' : 'Nenhum evento realizado ainda'}>
            {editar && aba === 'proximos' && <button type="button" className="btn btn-primario" onClick={() => setEditando({})}>Marcar um evento</button>}
          </Vazio>
        ) : (
          <div className="tabela-wrap">
            <table>
              <thead><tr><th>Data</th><th>Evento</th><th className="esconder-mobile">Local</th><th>Situação</th></tr></thead>
              <tbody>
                {lista.map((e) => (
                  <tr key={e.id} className="clicavel" onClick={() => setAberto(e.id)}>
                    <td><strong>{fmtData(e.data)}</strong>{e.hora && <span className="sub">{e.hora}</span>}</td>
                    <td><strong>{e.nome}</strong><span className="sub">{[e.tipo, e.atracao].filter(Boolean).join(' — ')}</span></td>
                    <td className="esconder-mobile">{e.local || '—'}</td>
                    <td><Selo tipo={COR_STATUS[e.status]}>{e.status}</Selo></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editando && <FormEvento evento={editando} aoFechar={() => setEditando(null)} />}
      {aberto && dados.find((e) => e.id === aberto) && (
        <DetalheEvento evento={dados.find((e) => e.id === aberto)} aoFechar={() => setAberto(null)}
          aoEditar={editar ? (e) => { setAberto(null); setEditando(e); } : null} />
      )}
    </>
  );
}

function FormEvento({ evento, aoFechar }) {
  const { entidadeId, entidade } = useAuth();
  const acao = useAcao();
  const novo = !evento.id;
  const { dados, ligar } = useFormulario({ tipo: 'Baile', status: 'Planejado', data: hoje(), local: entidade?.nome || '', mostrarNoPortal: true, ...evento });

  function gravar() {
    return acao(() => salvar(entidadeId, 'eventos', evento.id, {
      ...dados, nome: dados.nome.trim(),
      precoSocio: dados.precoSocio === '' || dados.precoSocio == null ? null : Number(dados.precoSocio),
      precoNaoSocio: dados.precoNaoSocio === '' || dados.precoNaoSocio == null ? null : Number(dados.precoNaoSocio),
      capacidade: dados.capacidade ? Number(dados.capacidade) : null,
    }), novo ? 'Evento marcado' : 'Evento atualizado');
  }
  async function remover() {
    if (!window.confirm(`Excluir o evento "${evento.nome}"? Os lançamentos de caixa ligados a ele continuam no caixa.`)) return;
    if (await acao(() => excluir(entidadeId, 'eventos', evento.id), 'Evento excluído')) aoFechar();
  }

  return (
    <ModalForm largo titulo={novo ? 'Novo evento' : `Editar ${evento.nome}`} aoFechar={aoFechar} aoSalvar={gravar}
      extraRodape={!novo && <button type="button" className="btn btn-perigo" onClick={remover}>Excluir</button>}>
      <div className="form-grade-3">
        <Campo rotulo="Nome do evento" className="col-2"><input placeholder="Baile de aniversário do CTG" {...ligar('nome', { obrigatorio: true })} autoFocus /></Campo>
        <Campo rotulo="Tipo"><select {...ligar('tipo')}>{TIPOS_EVENTO.map((t) => <option key={t}>{t}</option>)}</select></Campo>
        <Campo rotulo="Data"><input type="date" {...ligar('data', { obrigatorio: true })} /></Campo>
        <Campo rotulo="Horário"><input type="time" {...ligar('hora')} /></Campo>
        <Campo rotulo="Situação"><select {...ligar('status')}>{Object.keys(COR_STATUS).map((s) => <option key={s}>{s}</option>)}</select></Campo>
        <Campo rotulo="Local" className="col-2"><input {...ligar('local')} /></Campo>
        <Campo rotulo="Responsável"><input {...ligar('responsavel')} /></Campo>
        <Campo rotulo="Atração / conjunto" className="col-2"><input placeholder="Grupo Os Serranos" {...ligar('atracao')} /></Campo>
        <Campo rotulo="Capacidade"><input type="number" min="0" {...ligar('capacidade')} /></Campo>
        <Campo rotulo="Ingresso sócio (R$)"><input type="number" step="0.01" min="0" {...ligar('precoSocio')} /></Campo>
        <Campo rotulo="Ingresso não sócio (R$)"><input type="number" step="0.01" min="0" {...ligar('precoNaoSocio')} /></Campo>
        <Campo rotulo="Traje"><input placeholder="Pilcha obrigatória" {...ligar('traje')} /></Campo>
        <Campo rotulo="Descrição / observações" className="col-3"><textarea {...ligar('descricao')} /></Campo>
        <div className="col-3"><label className="checkbox"><input type="checkbox" checked={Boolean(dados.mostrarNoPortal)} onChange={ligar('mostrarNoPortal').onChange} />Mostrar na agenda do portal do sócio</label></div>
      </div>
    </ModalForm>
  );
}

function DetalheEvento({ evento: e, aoFechar, aoEditar }) {
  const { entidadeId, entidade, config, podeEditar } = useAuth();
  const movs = useColecao(entidadeId, 'caixa', [where('eventoId', '==', e.id)], e.id);
  const contas = useColecao(entidadeId, 'contas', [where('eventoId', '==', e.id)], e.id);
  const [novoMov, setNovoMov] = useState(null);
  const [novaConta, setNovaConta] = useState(null);
  const [ingressos, setIngressos] = useState(false);
  const podeCaixa = podeEditar('caixa');

  const receitas = movs.dados.filter((m) => m.tipo === 'entrada');
  const despesas = movs.dados.filter((m) => m.tipo === 'saida');
  const pendentes = contas.dados.filter((c) => c.status === 'aberto');
  const aReceber = somar(pendentes.filter((c) => c.tipo === 'receber'));
  const aPagar = somar(pendentes.filter((c) => c.tipo === 'pagar'));
  const resultado = arred(somar(receitas) - somar(despesas));
  const vendidos = receitas.reduce((s, m) => s + (Number(m.ingressos) || 0), 0);

  const porCategoria = useMemo(() => {
    const g = {};
    movs.dados.forEach((m) => {
      const k = `${m.tipo}|${m.categoria}`;
      g[k] = arred((g[k] || 0) + m.valor);
    });
    return Object.entries(g).map(([k, v]) => { const [tipo, cat] = k.split('|'); return { tipo, cat, v }; })
      .sort((a, b) => a.tipo.localeCompare(b.tipo) || b.v - a.v);
  }, [movs.dados]);

  function prestacaoContas() {
    relatorioPdf({
      entidade, titulo: `Prestação de contas — ${e.nome}`, subtitulo: `${e.tipo}, ${fmtData(e.data)}${e.local ? `, ${e.local}` : ''}`,
      resumo: [['Receitas', fmtMoeda(somar(receitas))], ['Despesas', fmtMoeda(somar(despesas))], ['Resultado', fmtMoeda(resultado)],
        ...(vendidos ? [['Ingressos vendidos', vendidos]] : []), ...(pendentes.length ? [['Pendente a pagar / receber', `${fmtMoeda(aPagar)} / ${fmtMoeda(aReceber)}`]] : [])],
      secoes: [
        { titulo: 'Resumo por categoria', colunas: ['Tipo', 'Categoria', 'Valor'], linhas: porCategoria.map((p) => [p.tipo === 'entrada' ? 'Receita' : 'Despesa', p.cat, fmtMoeda(p.v)]), alinharDireita: [2] },
        { titulo: 'Lançamentos', colunas: ['Data', 'Descrição', 'Categoria', 'Entrada', 'Saída'], linhas: [...movs.dados].sort((a, b) => a.data.localeCompare(b.data)).map((m) => [fmtData(m.data), m.descricao, m.categoria, m.tipo === 'entrada' ? fmtMoeda(m.valor) : '', m.tipo === 'saida' ? fmtMoeda(m.valor) : '']), rodape: ['', 'Totais', '', fmtMoeda(somar(receitas)), fmtMoeda(somar(despesas))], alinharDireita: [3, 4] },
      ],
    });
  }

  return (
    <>
      <Modal largo titulo={e.nome} aoFechar={aoFechar} rodape={<>
        <button type="button" className="btn" onClick={prestacaoContas}><Icone nome="pdf" tam={18} />Prestação de contas</button>
        {aoEditar && <button type="button" className="btn btn-primario" onClick={() => aoEditar(e)}>Editar evento</button>}
      </>}>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <Selo tipo={COR_STATUS[e.status]}>{e.status}</Selo><Selo>{e.tipo}</Selo>
        </div>
        <dl className="ficha">
          <div><dt>Data</dt><dd>{fmtData(e.data)}{e.hora && `, ${e.hora}`}</dd></div>
          <div><dt>Local</dt><dd>{e.local || '—'}</dd></div>
          <div><dt>Atração</dt><dd>{e.atracao || '—'}</dd></div>
          <div><dt>Responsável</dt><dd>{e.responsavel || '—'}</dd></div>
          <div><dt>Ingresso sócio / não sócio</dt><dd>{e.precoSocio != null ? fmtMoeda(e.precoSocio) : '—'} / {e.precoNaoSocio != null ? fmtMoeda(e.precoNaoSocio) : '—'}</dd></div>
          <div><dt>Traje</dt><dd>{e.traje || '—'}</dd></div>
          {e.descricao && <div style={{ gridColumn: '1 / -1' }}><dt>Observações</dt><dd>{e.descricao}</dd></div>}
        </dl>

        <h3 style={{ margin: '1.5rem 0 .75rem' }}>Financeiro do evento</h3>
        <div className="indicadores" style={{ marginBottom: '1rem' }}>
          <div className="indicador positivo"><div className="rotulo">Receitas</div><div className="valor">{fmtMoeda(somar(receitas))}</div>{vendidos > 0 && <div className="detalhe">{vendidos} ingressos</div>}</div>
          <div className="indicador alerta"><div className="rotulo">Despesas</div><div className="valor">{fmtMoeda(somar(despesas))}</div></div>
          <div className={`indicador ${resultado >= 0 ? 'positivo' : 'alerta'}`}><div className="rotulo">Resultado</div><div className="valor">{fmtMoeda(resultado)}</div>
            {pendentes.length > 0 && <div className="detalhe">Pendente: pagar {fmtMoeda(aPagar)}, receber {fmtMoeda(aReceber)}</div>}</div>
        </div>
        {podeCaixa && (
          <div className="acoes" style={{ marginBottom: '1rem' }}>
            <button type="button" className="btn btn-ok btn-peq" onClick={() => setIngressos(true)}>Registrar venda de ingressos</button>
            <button type="button" className="btn btn-peq" onClick={() => setNovoMov({ tipo: 'entrada', eventoId: e.id, categoria: categoriaReceita(e.tipo, config.categoriasReceita) })}>+ Receita</button>
            <button type="button" className="btn btn-peq" onClick={() => setNovoMov({ tipo: 'saida', eventoId: e.id })}>− Despesa</button>
            <button type="button" className="btn btn-peq" onClick={() => setNovaConta({ tipo: 'pagar', eventoId: e.id })}>Conta a pagar do evento</button>
          </div>
        )}
        {movs.carregando ? <Carregando /> : movs.dados.length === 0 && !pendentes.length ? <p className="sub">Nenhum lançamento ligado a este evento ainda.</p> : (
          <div className="tabela-wrap" style={{ border: '1px solid var(--linha)', borderRadius: 6 }}>
            <table>
              <thead><tr><th>Data</th><th>Descrição</th><th className="num">Valor</th></tr></thead>
              <tbody>
                {[...movs.dados].sort((a, b) => a.data.localeCompare(b.data)).map((m) => (
                  <tr key={m.id}><td>{fmtData(m.data)}</td><td>{m.descricao}<span className="sub">{m.categoria}</span></td><td className={`num ${m.tipo}`}>{m.tipo === 'entrada' ? '+' : '−'} {fmtMoeda(m.valor)}</td></tr>
                ))}
                {pendentes.map((c) => (
                  <tr key={c.id}><td>{fmtData(c.vencimento)}</td><td>{c.descricao} <Selo tipo="pendente">{c.tipo === 'pagar' ? 'a pagar' : 'a receber'}</Selo></td><td className="num">{fmtMoeda(c.valor)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
      {novoMov && <FormMovimento mov={novoMov} evento={e} aoFechar={() => setNovoMov(null)} />}
      {novaConta && <FormConta conta={novaConta} evento={e} aoFechar={() => setNovaConta(null)} />}
      {ingressos && <VendaIngressos evento={e} aoFechar={() => setIngressos(false)} />}
    </>
  );
}

function VendaIngressos({ evento, aoFechar }) {
  const { entidadeId, config } = useAuth();
  const acao = useAcao();
  const { dados, ligar } = useFormulario({
    socio: '', naoSocio: '', precoSocio: evento.precoSocio ?? '', precoNaoSocio: evento.precoNaoSocio ?? '',
    data: evento.data <= hoje() ? evento.data : hoje(), forma: 'Dinheiro', conta: config.contasFinanceiras[0],
  });
  const qs = Number(dados.socio) || 0;
  const qn = Number(dados.naoSocio) || 0;
  const total = arred(qs * (Number(dados.precoSocio) || 0) + qn * (Number(dados.precoNaoSocio) || 0));

  function gravar() {
    if (!total) throw new Error('Informe a quantidade e o preço dos ingressos.');
    const partes = [qs && `${qs} sócio × ${fmtMoeda(dados.precoSocio)}`, qn && `${qn} não sócio × ${fmtMoeda(dados.precoNaoSocio)}`].filter(Boolean).join(' + ');
    return acao(() => salvar(entidadeId, 'caixa', null, {
      data: dados.data, tipo: 'entrada', valor: total, categoria: categoriaReceita(evento.tipo, config.categoriasReceita),
      descricao: `Ingressos ${evento.nome} (${partes})`, conta: dados.conta, forma: dados.forma,
      origem: 'evento', eventoId: evento.id, eventoNome: evento.nome, ingressos: qs + qn,
    }), 'Venda registrada no caixa');
  }

  return (
    <ModalForm titulo="Venda de ingressos" aoFechar={aoFechar} aoSalvar={gravar} textoSalvar={`Registrar ${fmtMoeda(total)}`}>
      <p>Lance o fechamento da bilheteria (pode registrar mais de uma vez, por exemplo, antecipados e portaria).</p>
      <div className="form-grade">
        <Campo rotulo="Ingressos de sócio"><input type="number" min="0" {...ligar('socio')} autoFocus /></Campo>
        <Campo rotulo="Preço sócio (R$)"><input type="number" step="0.01" min="0" {...ligar('precoSocio')} /></Campo>
        <Campo rotulo="Ingressos de não sócio"><input type="number" min="0" {...ligar('naoSocio')} /></Campo>
        <Campo rotulo="Preço não sócio (R$)"><input type="number" step="0.01" min="0" {...ligar('precoNaoSocio')} /></Campo>
        <Campo rotulo="Data"><input type="date" {...ligar('data', { obrigatorio: true })} /></Campo>
        <Campo rotulo="Entrou em"><select {...ligar('conta')}>{config.contasFinanceiras.map((c) => <option key={c}>{c}</option>)}</select></Campo>
        <Campo rotulo="Forma"><select {...ligar('forma')}>{FORMAS_PAGAMENTO.map((f) => <option key={f}>{f}</option>)}</select></Campo>
      </div>
    </ModalForm>
  );
}
