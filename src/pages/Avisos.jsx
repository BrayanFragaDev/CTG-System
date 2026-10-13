import { useEffect, useMemo, useState } from 'react';
import { orderBy, limit, collection, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { useColecao } from '../lib/db';
import { fmtData, hoje, normalizar } from '../lib/format';
import {
  opcoesPublico, destinatariosDe, modeloEvento, publicarAviso, marcarEnviado, contarLeituras,
  linkWhatsapp, lotesEmail, linkEmail,
} from '../lib/avisos';
import { Cabecalho, Campo, Carregando, ErroLeitura, Modal, Selo, Vazio, useAcao, useNotificar, mensagemErro } from '../components/ui';
import Icone from '../components/Icone';

function quando(ts) {
  if (!ts?.seconds) return 'agora';
  return new Date(ts.seconds * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Avisos() {
  const { entidadeId, podeEditar } = useAuth();
  const { dados, carregando, erro } = useColecao(entidadeId, 'avisos', [orderBy('criadoEm', 'desc'), limit(60)]);
  const [novo, setNovo] = useState(false);
  const [aberto, setAberto] = useState(null);
  const editar = podeEditar('avisos');

  return (
    <>
      <Cabecalho titulo="Avisos aos sócios" descricao="Comunicados que aparecem no portal do sócio e podem ser repassados pelo WhatsApp e por e-mail.">
        {editar && <button type="button" className="btn btn-primario" onClick={() => setNovo(true)}><Icone nome="avisos" tam={18} />Novo aviso</button>}
      </Cabecalho>
      <ErroLeitura erro={erro} />
      <div className="painel">
        {carregando ? <Carregando /> : !dados.length ? (
          <Vazio titulo="Nenhum aviso enviado ainda">
            <p>Ao confirmar um evento, o sistema oferece um aviso pronto para os sócios. Você também pode escrever um comunicado livre.</p>
            {editar && <button type="button" className="btn btn-primario" onClick={() => setNovo(true)}>Escrever um aviso</button>}
          </Vazio>
        ) : (
          <ul className="lista-avisos">
            {dados.map((a) => <LinhaAviso key={a.id} aviso={a} aoAbrir={() => setAberto(a.id)} />)}
          </ul>
        )}
      </div>
      {novo && <NovoAviso aoFechar={() => setNovo(false)} aoEnviar={(id) => { setNovo(false); setAberto(id); }} />}
      {aberto && <DetalheAviso avisoId={aberto} aoFechar={() => setAberto(null)} />}
    </>
  );
}

function LinhaAviso({ aviso: a, aoAbrir }) {
  const { entidadeId } = useAuth();
  const [lidos, setLidos] = useState(null);
  useEffect(() => { contarLeituras(entidadeId, a.id).then(setLidos).catch(() => setLidos(null)); }, [entidadeId, a.id]);
  const whats = (a.enviadosWhatsapp || []).length;
  return (
    <li>
      <button type="button" className="aviso-linha" onClick={aoAbrir}>
        <span className={`aviso-marca ${a.tipo}`} aria-hidden="true" />
        <span className="aviso-texto">
          <strong>{a.titulo}</strong>
          <span className="sub">{quando(a.criadoEm)} — {a.publicoRotulo} — por {a.atualizadoPor || '—'}</span>
        </span>
        <span className="aviso-numeros">
          <span><b className="num">{a.totalDestinatarios}</b> sócios</span>
          <span><b className="num">{lidos ?? '…'}</b> leram no portal</span>
          {whats > 0 && <span><b className="num">{whats}</b> no WhatsApp</span>}
        </span>
      </button>
    </li>
  );
}

// ---------- Escrever e enviar ----------
export function NovoAviso({ evento, tipoEvento = 'confirmado', aoFechar, aoEnviar }) {
  const { entidadeId, entidade, config } = useAuth();
  const notificar = useNotificar();
  const socios = useColecao(entidadeId, 'socios', [orderBy('nome')]);
  const invernadas = useColecao(entidadeId, 'invernadas', [orderBy('nome')]);
  const modelo = evento ? modeloEvento(evento, entidade, tipoEvento) : { titulo: '', mensagem: '' };
  const [titulo, setTitulo] = useState(modelo.titulo);
  const [mensagem, setMensagem] = useState(modelo.mensagem);
  const [publico, setPublico] = useState('todos');
  const [enviando, setEnviando] = useState(false);

  const opcoes = opcoesPublico(config, invernadas.dados);
  const destinatarios = useMemo(() => destinatariosDe(publico, socios.dados, invernadas.dados), [publico, socios.dados, invernadas.dados]);
  const aceitam = destinatarios.filter((s) => s.aceitaAvisos !== false);
  const comFone = aceitam.filter((s) => (s.telefone || '').replace(/\D/g, '').length >= 10).length;
  const comEmail = aceitam.filter((s) => /@/.test(s.email || '')).length;

  async function enviar(e) {
    e.preventDefault();
    if (!destinatarios.length) { notificar('Nenhum sócio nesse público. Escolha outro.', 'erro'); return; }
    setEnviando(true);
    try {
      const id = await publicarAviso(entidadeId, {
        titulo, mensagem, publico, publicoRotulo: opcoes.find((o) => o.valor === publico)?.rotulo || publico,
        destinatarios, evento, tipo: evento ? (tipoEvento === 'cancelado' ? 'cancelamento' : 'evento') : 'geral',
      });
      notificar(`Aviso publicado no portal de ${destinatarios.length} sócio(s)`);
      aoEnviar(id);
    } catch (err) {
      console.error(err);
      notificar(mensagemErro(err), 'erro');
      setEnviando(false);
    }
  }

  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <form className="modal largo" onSubmit={enviar} role="dialog" aria-modal="true" aria-label="Novo aviso">
        <div className="modal-topo">
          <h2>{evento ? (tipoEvento === 'cancelado' ? 'Avisar o cancelamento' : 'Avisar os sócios') : 'Novo aviso'}</h2>
          <button type="button" onClick={aoFechar} aria-label="Fechar">×</button>
        </div>
        <div className="modal-corpo">
          {evento && tipoEvento !== 'cancelado' && <div className="aviso info" style={{ marginBottom: '1rem' }}><strong>{evento.nome}</strong> está confirmado. O texto abaixo já vem pronto: revise e envie.</div>}
          <div className="compor">
            <div>
              <Campo rotulo="Para quem">
                <select value={publico} onChange={(e) => setPublico(e.target.value)}>
                  {opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Título" ajuda="Aparece em destaque no portal"><input value={titulo} maxLength={150} onChange={(e) => setTitulo(e.target.value)} required /></Campo>
              <Campo rotulo="Mensagem" ajuda="Use *asteriscos* para negrito no WhatsApp">
                <textarea value={mensagem} maxLength={4000} rows={11} onChange={(e) => setMensagem(e.target.value)} required />
              </Campo>
            </div>
            <aside className="previa" aria-label="Prévia">
              <div className="previa-alcance">
                <div><b className="num">{socios.carregando ? '…' : destinatarios.length}</b><span>sócios recebem no portal</span></div>
                <div><b className="num">{comFone}</b><span>com WhatsApp</span></div>
                <div><b className="num">{comEmail}</b><span>com e-mail</span></div>
              </div>
              {destinatarios.length > aceitam.length && <p className="sub">{destinatarios.length - aceitam.length} pediram para não receber por WhatsApp e e-mail; veem só no portal.</p>}
              <div className="previa-celular">
                <div className="previa-topo">{entidade?.nome}</div>
                <div className="previa-balao"><Formatado texto={mensagem || 'A mensagem aparece aqui.'} /></div>
              </div>
            </aside>
          </div>
        </div>
        <div className="modal-rodape">
          <span className="sub" style={{ flex: 1 }}>Depois de publicar, você escolhe se repassa pelo WhatsApp ou por e-mail.</span>
          <button type="button" className="btn" onClick={aoFechar}>Agora não</button>
          <button type="submit" className="btn btn-primario" disabled={enviando || socios.carregando}>{enviando ? 'Publicando…' : `Publicar para ${destinatarios.length} sócio(s)`}</button>
        </div>
      </form>
    </div>
  );
}

// *negrito* do WhatsApp na prévia (sem HTML vindo do usuário)
export function Formatado({ texto }) {
  return texto.split('\n').map((linha, i) => (
    <span key={i} style={{ display: 'block', minHeight: '1.2em' }}>
      {linha.split(/(\*[^*\n]+\*)/g).map((p, j) => (p.startsWith('*') && p.endsWith('*') && p.length > 2 ? <strong key={j}>{p.slice(1, -1)}</strong> : p))}
    </span>
  ));
}

// ---------- Acompanhar e repassar ----------
export function DetalheAviso({ avisoId, aoFechar }) {
  const { entidadeId, podeEditar } = useAuth();
  const acao = useAcao();
  const notificar = useNotificar();
  const avisos = useColecao(entidadeId, 'avisos', [orderBy('criadoEm', 'desc'), limit(60)]);
  const socios = useColecao(entidadeId, 'socios', [orderBy('nome')]);
  const [leituras, setLeituras] = useState({});
  const [busca, setBusca] = useState('');
  const [aba, setAba] = useState('whatsapp');
  const a = avisos.dados.find((x) => x.id === avisoId);
  const editar = podeEditar('avisos');

  useEffect(() => onSnapshot(collection(db, 'entidades', entidadeId, 'avisos', avisoId, 'leituras'),
    (s) => setLeituras(Object.fromEntries(s.docs.map((d) => [d.data().socioId, d.data().em])))), [entidadeId, avisoId]);

  if (!a) return <Modal titulo="Aviso" aoFechar={aoFechar}><Carregando /></Modal>;

  const mapa = Object.fromEntries(socios.dados.map((s) => [s.id, s]));
  const dest = (a.destinatarios || []).map((id) => mapa[id] || { id, nome: '(sócio removido)' });
  const enviados = new Set(a.enviadosWhatsapp || []);
  const b = normalizar(busca);
  const lista = dest.filter((s) => !b || normalizar(s.nome).includes(b));
  const aceitam = dest.filter((s) => s.aceitaAvisos !== false);
  const lotes = lotesEmail(aceitam);
  const lidos = Object.keys(leituras).length;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(a.mensagem);
      notificar('Mensagem copiada. Cole no grupo do WhatsApp da entidade.');
    } catch { notificar('Não foi possível copiar. Selecione o texto e copie manualmente.', 'erro'); }
  }
  function abrirWhats(s) {
    window.open(linkWhatsapp(s.telefone, a.mensagem), '_blank', 'noopener');
    if (editar && !enviados.has(s.id)) acao(() => marcarEnviado(entidadeId, a, 'enviadosWhatsapp', s.id));
  }

  return (
    <Modal largo titulo={a.titulo} aoFechar={aoFechar}>
      <div className="detalhe-aviso-topo">
        <div className="sub">{quando(a.criadoEm)} — {a.publicoRotulo} — por {a.atualizadoPor}</div>
        {a.eventoNome && <Selo tipo="info">Evento: {a.eventoNome}{a.eventoData ? `, ${fmtData(a.eventoData)}` : ''}</Selo>}
      </div>
      <div className="indicadores" style={{ margin: '1rem 0' }}>
        <div className="indicador"><div className="rotulo">No portal</div><div className="valor">{dest.length}</div><div className="detalhe">sócios</div></div>
        <div className="indicador positivo"><div className="rotulo">Leram</div><div className="valor">{lidos}</div><div className="detalhe">{dest.length ? Math.round((lidos / dest.length) * 100) : 0}% (quem tem acesso ao portal)</div></div>
        <div className="indicador"><div className="rotulo">WhatsApp enviados</div><div className="valor">{enviados.size}</div><div className="detalhe">um a um</div></div>
      </div>
      <details className="mensagem-enviada">
        <summary>Ver a mensagem</summary>
        <div className="previa-balao" style={{ marginTop: '.6rem' }}><Formatado texto={a.mensagem} /></div>
      </details>

      <div className="abas" role="tablist" style={{ padding: 0, margin: '1rem 0 0' }}>
        {[['whatsapp', 'WhatsApp'], ['email', 'E-mail'], ['leituras', 'Quem leu']].map(([id, r]) => (
          <button key={id} type="button" role="tab" aria-selected={aba === id} className={aba === id ? 'ativa' : ''} onClick={() => setAba(id)}>{r}</button>
        ))}
      </div>

      {aba === 'whatsapp' && (
        <div className="canal">
          <div className="canal-acao">
            <div><strong>Grupo da entidade</strong><span className="sub">O jeito mais rápido: copie e cole no grupo.</span></div>
            <button type="button" className="btn btn-primario" onClick={copiar}>Copiar mensagem</button>
          </div>
          <div className="canal-acao" style={{ borderBottom: 'none' }}>
            <div><strong>Um a um</strong><span className="sub">Abre o WhatsApp com a mensagem pronta para cada sócio. Fica marcado quem já recebeu.</span></div>
            <input type="search" placeholder="Buscar sócio" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ maxWidth: 220 }} />
          </div>
          <ul className="lista-simples lista-envio">
            {lista.map((s) => {
              const fone = (s.telefone || '').replace(/\D/g, '');
              return (
                <li key={s.id}>
                  <span>{s.nome}<span className="sub">{s.telefone || 'sem telefone'}</span></span>
                  <span>
                    {s.aceitaAvisos === false ? <Selo>não quer receber</Selo>
                      : fone.length < 10 ? <Selo>sem WhatsApp</Selo>
                        : enviados.has(s.id) ? <button type="button" className="btn btn-peq" onClick={() => abrirWhats(s)}>Enviado ✓ reenviar</button>
                          : <button type="button" className="btn btn-ok btn-peq" onClick={() => abrirWhats(s)}>Enviar</button>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {aba === 'email' && (
        <div className="canal">
          {!lotes.length ? <p className="sub" style={{ padding: '1rem 0' }}>Nenhum destinatário tem e-mail cadastrado (ou aceita receber).</p> : (
            <>
              <p style={{ margin: '1rem 0' }}>Abre o seu programa de e-mail com os sócios em <strong>cópia oculta</strong> (ninguém vê o e-mail dos outros). {lotes.length > 1 && `São ${lotes.length} mensagens de até 40 pessoas, para não cair no limite do provedor.`}</p>
              <div className="acoes">
                {lotes.map((l, i) => (
                  <a key={i} className="btn" href={linkEmail(l, a.titulo, a.mensagem)}
                    onClick={() => editar && !a.emailEnviado && acao(() => marcarEnviado(entidadeId, a, 'emailEnviado', true))}>
                    {lotes.length > 1 ? `E-mail ${i + 1} de ${lotes.length} (${l.length})` : `Abrir e-mail para ${l.length} sócio(s)`}
                  </a>
                ))}
              </div>
              {a.emailEnviado && <p className="sub" style={{ marginTop: '.75rem' }}>E-mail já aberto para envio anteriormente.</p>}
            </>
          )}
        </div>
      )}

      {aba === 'leituras' && (
        <div className="canal">
          <p className="sub" style={{ margin: '1rem 0' }}>Só aparece a leitura de quem tem acesso ao portal do sócio (crie em Usuários e acessos).</p>
          <ul className="lista-simples">
            {dest.filter((s) => leituras[s.id]).map((s) => <li key={s.id}><span>{s.nome}</span><span className="sub">leu em {quando(leituras[s.id])}</span></li>)}
            {!lidos && <li><span className="sub">Ninguém leu ainda.</span></li>}
          </ul>
        </div>
      )}
    </Modal>
  );
}

// Faixa usada no detalhe do evento e no painel
export function eventoSemAviso(e) {
  return e.status === 'Confirmado' && !e.avisoEnviadoEm && e.data >= hoje();
}
