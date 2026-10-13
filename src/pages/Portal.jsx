import { useEffect, useState } from 'react';
import { getDoc, doc, where, orderBy, limit } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { useColecao, docRef } from '../lib/db';
import { registrarLeitura } from '../lib/avisos';
import { fmtMoeda, fmtData, fmtCompetencia, hoje, somar } from '../lib/format';
import { reciboMensalidades } from '../lib/pdf';
import { Carregando, Selo, useNotificar } from '../components/ui';
import { Marca } from '../components/Icone';
import { statusMensalidade } from './Mensalidades';
import { useFoto, salvarFoto } from '../lib/socios';
import { prepararFoto } from '../lib/imagens';
import { Formatado } from './Avisos';

function quando(ts) {
  if (!ts?.seconds) return '';
  return new Date(ts.seconds * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
}

export default function Portal() {
  const { perfil, user, entidade, entidadeId, config, sair } = useAuth();
  const notificar = useNotificar();
  const [socio, setSocio] = useState(null);
  const sid = perfil.socioId;
  const mens = useColecao(entidadeId, 'mensalidades', sid ? [where('socioId', '==', sid)] : null, sid);
  const eventos = useColecao(entidadeId, 'eventos', [where('data', '>=', hoje()), orderBy('data')]);
  const avisosTodos = useColecao(entidadeId, 'avisos', sid ? [where('destinatarios', 'array-contains', sid)] : null, sid);
  // ordena aqui (dispensa índice composto no banco)
  const avisos = { ...avisosTodos, dados: [...avisosTodos.dados].sort((a, b) => (b.criadoEm?.seconds || 0) - (a.criadoEm?.seconds || 0)).slice(0, 20) };
  const [lidos, setLidos] = useState({});
  const [aberto, setAberto] = useState(null);
  const foto = useFoto(entidadeId, sid);
  const [trocandoFoto, setTrocandoFoto] = useState(false);
  async function trocarFoto(e) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setTrocandoFoto(true);
    try {
      await salvarFoto(entidadeId, sid, await prepararFoto(arquivo));
      notificar('Foto atualizada');
    } catch (err) { notificar(err.message || 'Não foi possível usar essa foto.', 'erro'); }
    finally { setTrocandoFoto(false); }
  }

  useEffect(() => {
    if (!entidadeId || !sid) return;
    getDoc(docRef(entidadeId, 'socios', sid)).then((s) => setSocio(s.exists() ? { id: s.id, ...s.data() } : {})).catch(() => setSocio({}));
  }, [entidadeId, sid]);

  // Quais avisos este sócio já leu (cada leitura é um documento só dele)
  const chaveAvisos = avisos.dados.map((a) => a.id).join('|');
  useEffect(() => {
    if (!avisos.dados.length || !user) return;
    let vivo = true;
    Promise.all(avisos.dados.map((a) => getDoc(doc(db, 'entidades', entidadeId, 'avisos', a.id, 'leituras', user.uid))
      .then((s) => [a.id, s.exists()]).catch(() => [a.id, false])))
      .then((pares) => vivo && setLidos(Object.fromEntries(pares)));
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveAvisos, entidadeId, user]);

  // mensalidades canceladas (isenções concedidas) não aparecem para o sócio
  const lista = mens.dados.filter((m) => m.status !== 'cancelado').sort((a, b) => b.competencia.localeCompare(a.competencia));
  const abertas = lista.filter((m) => m.status === 'aberto');
  const atrasadas = abertas.filter((m) => m.vencimento < hoje());
  const pagas = lista.filter((m) => m.status === 'pago');
  const agenda = eventos.dados.filter((e) => e.mostrarNoPortal !== false && e.status !== 'Cancelado');
  const novos = avisos.dados.filter((a) => lidos[a.id] === false).length;

  function abrirAviso(a) {
    setAberto(aberto === a.id ? null : a.id);
    if (lidos[a.id] === false) {
      setLidos((l) => ({ ...l, [a.id]: true }));
      registrarLeitura(entidadeId, a.id, sid).catch(() => {});
    }
  }

  function copiarPix() {
    navigator.clipboard?.writeText(config.chavePix).then(() => notificar('Chave PIX copiada')).catch(() => {});
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <header className="topo-portal">
        {entidade?.logo ? <img src={entidade.logo} alt={`Brasão de ${entidade.nome}`} className="brasao-lateral" style={{ width: 36, height: 36 }} /> : <Marca tam={32} />}
        <strong style={{ flex: 1 }}>{entidade?.nome || 'Portal do sócio'}</strong>
        {novos > 0 && <a href="#avisos" className="sino" aria-label={`${novos} aviso(s) novo(s)`}>{novos}<span className="sino-texto"> {novos === 1 ? 'aviso novo' : 'avisos novos'}</span></a>}
        <button type="button" onClick={sair}>Sair</button>
      </header>
      <main className="conteudo" style={{ maxWidth: 1040, margin: '0 auto' }}>
        {!sid && <div className="aviso">Seu acesso ainda não foi ligado a um cadastro de sócio. Fale com a secretaria.</div>}

        <div className="portal-topo">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
            <Carteirinha socio={socio} perfil={perfil} entidade={entidade} foto={foto} emDia={!atrasadas.length} carregando={!socio || mens.carregando} />
            {sid && (
              <div className="trocar-foto">
                <label htmlFor="minha-foto" className="btn-link" style={{ cursor: 'pointer' }}>{trocandoFoto ? 'Enviando foto…' : foto ? 'Trocar minha foto' : 'Colocar minha foto'}</label>
                <input id="minha-foto" type="file" accept="image/png,image/jpeg,image/webp" onChange={trocarFoto} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />
              </div>
            )}
          </div>

          <section className="painel avisos-portal" id="avisos" aria-labelledby="titulo-avisos">
            <div className="painel-titulo"><h2 id="titulo-avisos">Avisos da entidade</h2>{novos > 0 && <Selo tipo="atraso">{novos} novo(s)</Selo>}</div>
            {avisos.carregando ? <Carregando /> : !avisos.dados.length ? (
              <div className="painel-corpo"><p className="sub">Nenhum aviso por enquanto. Quando a patronagem confirmar um evento, ele aparece aqui.</p></div>
            ) : (
              <ul className="feed">
                {avisos.dados.map((a) => (
                  <li key={a.id} className={lidos[a.id] === false ? 'nao-lido' : ''}>
                    <button type="button" onClick={() => abrirAviso(a)} aria-expanded={aberto === a.id}>
                      <span className={`aviso-marca ${a.tipo}`} aria-hidden="true" />
                      <span style={{ flex: 1 }}><strong>{a.titulo}</strong><span className="sub">{quando(a.criadoEm)}{lidos[a.id] === false ? ' — novo' : ''}</span></span>
                      <span aria-hidden="true">{aberto === a.id ? '−' : '+'}</span>
                    </button>
                    {aberto === a.id && <div className="feed-texto"><Formatado texto={a.mensagem} /></div>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {abertas.length > 0 && config.chavePix && (
          <div className="aviso info pix-aviso">
            <p>Você tem <strong>{fmtMoeda(somar(abertas))}</strong> em aberto. Pague por PIX e envie o comprovante à tesouraria.</p>
            <div className="pix-chave">
              <span><span className="sub">Chave PIX</span><strong>{config.chavePix}</strong></span>
              <button type="button" className="btn btn-peq" onClick={copiarPix}>Copiar chave</button>
            </div>
          </div>
        )}

        <section className="painel">
          <div className="painel-titulo"><h2>Minhas mensalidades</h2><span className="sub">{pagas.length} paga(s){abertas.length ? `, ${abertas.length} em aberto` : ''}</span></div>
          {mens.carregando ? <Carregando /> : !lista.length ? <div className="painel-corpo"><p className="sub">Nenhuma mensalidade lançada.</p></div> : (
            <ul className="lista-mensalidades">
              {lista.map((m) => {
                const st = statusMensalidade(m);
                return (
                  <li key={m.id}>
                    <div className="lm-mes">
                      <strong>{fmtCompetencia(m.competencia)}</strong>
                      <span className="sub">{m.status === 'pago' ? `Paga em ${fmtData(m.dataPagamento)}` : `Vence em ${fmtData(m.vencimento)}`}</span>
                    </div>
                    <div className="lm-valor">
                      <strong className="num">{fmtMoeda(m.valorPago ?? m.valor)}</strong>
                      <Selo tipo={st.tipo}>{st.texto}</Selo>
                    </div>
                    {m.status === 'pago' && <button type="button" className="btn btn-peq lm-recibo" onClick={() => reciboMensalidades(entidade, socio, [m])}>Recibo</button>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <div className="espaco" />

        <div className="grade grade-2">
          <section className="painel">
            <div className="painel-titulo"><h2>Agenda</h2></div>
            <div className="painel-corpo">
              {!agenda.length ? <p className="sub">Nenhum evento marcado.</p> : (
                <ul className="lista-simples">
                  {agenda.map((e) => (
                    <li key={e.id}>
                      <span><strong>{e.nome}</strong>{e.status === 'Confirmado' && <> <Selo tipo="ok">confirmado</Selo></>}
                        <span className="sub">{[e.tipo, e.atracao, e.traje].filter(Boolean).join(' — ')}</span>
                        {(e.precoSocio != null) && <span className="sub">Ingresso sócio: {fmtMoeda(e.precoSocio)}</span>}</span>
                      <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtData(e.data)}<span className="sub">{e.hora}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
          <section className="painel">
            <div className="painel-titulo"><h2>Meu cadastro</h2></div>
            <div className="painel-corpo">
              {!socio ? <Carregando /> : (
                <dl className="ficha">
                  <div><dt>Telefone</dt><dd>{socio.telefone || '—'}</dd></div>
                  <div><dt>E-mail</dt><dd>{socio.email || perfil.email}</dd></div>
                  <div><dt>Cartão MTG</dt><dd>{socio.carteiraMtg || '—'}</dd></div>
                  <div><dt>Recebe avisos por WhatsApp</dt><dd>{socio.aceitaAvisos === false ? 'Não' : 'Sim'}</dd></div>
                </dl>
              )}
              <p className="sub" style={{ marginTop: '1rem', color: 'var(--tinta-3)' }}>Algum dado errado, ou quer parar de receber avisos? Fale com a secretaria{entidade?.telefone ? ` pelo ${entidade.telefone}` : ''}.</p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

// Carteirinha digital: couro, pesponto e o nome do sócio — o "documento" que ele mostra na portaria
function Carteirinha({ socio, perfil, entidade, foto, emDia, carregando }) {
  const nome = socio?.nome || perfil.nome || '';
  return (
    <section className="carteirinha" aria-label="Carteirinha do sócio">
      <div className="carteirinha-costura">
        <div className="carteirinha-topo">
          <span style={{ display: 'flex', gap: '.55rem', alignItems: 'center' }}>
            {entidade?.logo && <img src={entidade.logo} alt="" className="carteirinha-brasao" />}
            {entidade?.nome}
          </span>
          <span>{[entidade?.cidade, entidade?.rt && `${entidade.rt}ª RT`].filter(Boolean).join(' — ')}</span>
        </div>
        <div className="carteirinha-meio">
          {foto && <img src={foto} alt={`Foto de ${nome}`} className="carteirinha-foto" />}
          <div className="carteirinha-nome">{nome}</div>
        </div>
        <dl className="carteirinha-dados">
          <div><dt>Matrícula</dt><dd>{socio?.matricula || '—'}</dd></div>
          <div><dt>Categoria</dt><dd>{socio?.categoria || '—'}</dd></div>
          <div><dt>Sócio desde</dt><dd>{socio?.dataAdmissao ? fmtData(socio.dataAdmissao).slice(3) : '—'}</dd></div>
        </dl>
        <div className={`carteirinha-situacao ${carregando ? '' : emDia ? 'em-dia' : 'pendente'}`}>
          {carregando ? 'Conferindo…' : emDia ? 'Mensalidades em dia' : 'Há mensalidade em atraso'}
        </div>
      </div>
    </section>
  );
}
