import { useEffect, useState } from 'react';
import { addDoc, collection, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { CONFIG_PADRAO } from '../lib/constantes';
import { Cabecalho, Carregando, Modal, ModalForm, Selo, Vazio, useAcao, useFormulario, useNotificar, mensagemErro } from '../components/ui';
import { contarRegistros, excluirEntidade } from '../lib/entidades';
import { normalizar } from '../lib/format';

const chaveNome = (n) => normalizar(n).replace(/[^a-z0-9]/g, '');
import Icone from '../components/Icone';
import { CamposEntidade } from './Configuracoes';

export default function Entidades() {
  const { entidades, entidadeId, trocarEntidade } = useAuth();
  const [editando, setEditando] = useState(null);
  const [excluindo, setExcluindo] = useState(null);
  const repetidos = new Set();
  const vistos = {};
  entidades.forEach((e) => { const k = chaveNome(e.nome); if (vistos[k]) { repetidos.add(k); } vistos[k] = true; });

  return (
    <>
      <Cabecalho titulo="Entidades" descricao="CTGs, piquetes e grupos atendidos por este sistema. Os dados de cada uma ficam separados.">
        <button type="button" className="btn btn-primario" onClick={() => setEditando({})}><Icone nome="mais" tam={18} />Nova entidade</button>
      </Cabecalho>
      <div className="painel">
        {entidades.length === 0 ? (
          <Vazio titulo="Nenhuma entidade cadastrada"><button type="button" className="btn btn-primario" onClick={() => setEditando({})}>Cadastrar a primeira</button></Vazio>
        ) : (
          <div className="tabela-wrap">
            <table>
              <thead><tr><th>Entidade</th><th className="esconder-mobile">Cidade</th><th className="esconder-mobile">RT</th><th>Situação</th><th /></tr></thead>
              <tbody>
                {entidades.map((e) => (
                  <tr key={e.id}>
                    <td><strong>{e.nome}</strong><span className="sub">{e.tipo}</span></td>
                    <td className="esconder-mobile">{e.cidade || '—'}</td>
                    <td className="esconder-mobile">{e.rt ? `${e.rt}ª` : '—'}</td>
                    <td>{e.ativo === false ? <Selo>Desativada</Selo> : <Selo tipo="ok">Ativa</Selo>}{e.id === entidadeId && <> <Selo tipo="info">aberta agora</Selo></>}
                      {repetidos.has(chaveNome(e.nome)) && <> <Selo tipo="atraso">nome repetido</Selo></>}</td>
                    <td className="acoes-celula">
                      {e.id !== entidadeId && <button type="button" className="btn btn-peq" onClick={() => trocarEntidade(e.id)}>Abrir</button>}{' '}
                      <button type="button" className="btn-link" onClick={() => setEditando(e)}>Editar</button>{' '}
                      <button type="button" className="btn-link" style={{ color: 'var(--lenco)' }} onClick={() => setExcluindo(e)}>Excluir</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="sub" style={{ marginTop: '1rem', color: 'var(--tinta-2)' }}>
        Para dar acesso à diretoria de uma entidade, abra a entidade e vá em <strong>Usuários e acessos</strong>.
      </p>
      {editando && <FormEntidade ent={editando} entidades={entidades} aoFechar={() => setEditando(null)} aoCriar={trocarEntidade} />}
      {excluindo && (
        <ExcluirEntidade ent={excluindo} aoFechar={() => setExcluindo(null)}
          aoExcluir={() => { if (excluindo.id === entidadeId) { const outra = entidades.find((x) => x.id !== excluindo.id); if (outra) trocarEntidade(outra.id); } }} />
      )}
    </>
  );
}

function FormEntidade({ ent, entidades, aoFechar, aoCriar }) {
  const acao = useAcao();
  const novo = !ent.id;
  const { dados, ligar } = useFormulario({ nome: '', tipo: 'CTG', uf: 'RS', ativo: true, ...ent });

  function gravar() {
    const { id, config, criadoEm, atualizadoEm, ...resto } = dados;
    if (novo) {
      const igual = entidades.find((e) => chaveNome(e.nome) === chaveNome(resto.nome));
      if (igual && !window.confirm(`Já existe uma entidade chamada "${igual.nome}". Cadastrar outra com o mesmo nome mesmo assim?`)) return false;
      return acao(async () => {
        const r = await addDoc(collection(db, 'entidades'), { ...resto, nome: resto.nome.trim(), config: CONFIG_PADRAO, ativo: true, criadoEm: serverTimestamp() });
        aoCriar(r.id);
      }, 'Entidade cadastrada');
    }
    return acao(() => updateDoc(doc(db, 'entidades', ent.id), { ...resto, atualizadoEm: serverTimestamp() }), 'Entidade atualizada');
  }

  return (
    <ModalForm largo titulo={novo ? 'Nova entidade' : `Editar ${ent.nome}`} aoFechar={aoFechar} aoSalvar={gravar}>
      <CamposEntidade ligar={ligar} />
      {!novo && <label className="checkbox"><input type="checkbox" checked={dados.ativo !== false} onChange={ligar('ativo').onChange} />Entidade ativa</label>}
    </ModalForm>
  );
}

function ExcluirEntidade({ ent, aoFechar, aoExcluir }) {
  const notificar = useNotificar();
  const [contagens, setContagens] = useState(null);
  const [erro, setErro] = useState(null);
  const [confirmacao, setConfirmacao] = useState('');
  const [progresso, setProgresso] = useState(null);

  useEffect(() => {
    let vivo = true;
    contarRegistros(ent.id).then((c) => vivo && setContagens(c)).catch((e) => vivo && setErro(e));
    return () => { vivo = false; };
  }, [ent.id]);

  const total = contagens ? contagens.reduce((s, c) => s + c.total, 0) : 0;
  const comDados = (contagens || []).filter((c) => c.total > 0);
  const confere = confirmacao.trim().toLowerCase() === ent.nome.trim().toLowerCase();
  const trabalhando = progresso !== null;

  async function excluir() {
    setProgresso(0);
    try {
      await excluirEntidade(ent.id, setProgresso);
      aoExcluir();
      notificar(`Entidade "${ent.nome}" excluída`);
      aoFechar();
    } catch (e) {
      console.error(e);
      setErro(e);
      setProgresso(null);
    }
  }

  return (
    <Modal titulo={`Excluir ${ent.nome}`} aoFechar={trabalhando ? undefined : aoFechar} rodape={<>
      <button type="button" className="btn" onClick={aoFechar} disabled={trabalhando}>Cancelar</button>
      <button type="button" className="btn btn-perigo" style={confere && contagens ? { background: 'var(--lenco)', color: '#fff', borderColor: 'var(--lenco)' } : undefined}
        disabled={!confere || !contagens || trabalhando} onClick={excluir}>
        {trabalhando ? `Excluindo… ${progresso}/${total}` : 'Excluir definitivamente'}
      </button>
    </>}>
      {erro && <div className="aviso erro">Não foi possível concluir: {mensagemErro(erro)}{trabalhando ? '' : ' Se parte dos dados já foi apagada, tente excluir de novo.'}</div>}
      {!contagens && !erro ? <Carregando texto="Contando os registros desta entidade…" /> : contagens && (
        <>
          {total === 0 ? (
            <div className="aviso info">Esta entidade está vazia: não tem sócios, lançamentos nem usuários. Pode excluir sem perder nada.</div>
          ) : (
            <>
              <div className="aviso erro">Tudo abaixo será apagado junto e <strong>não há como desfazer</strong>:</div>
              <ul className="lista-simples" style={{ marginBottom: '1rem' }}>
                {comDados.map((c) => <li key={c.nome}><span>{c.rotulo}</span><strong className="num">{c.total}</strong></li>)}
              </ul>
              <p>Se esta for a cópia duplicada com dados que você quer manter, cancele e use a outra entidade para continuar.</p>
            </>
          )}
          <div className="campo">
            <label className="campo-rotulo" htmlFor="conf-ent">Para confirmar, digite o nome da entidade: <strong>{ent.nome}</strong></label>
            <input id="conf-ent" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} autoComplete="off" disabled={trabalhando} autoFocus />
          </div>
          {comDados.some((c) => c.nome === 'usuarios') && <p className="sub">Os logins dos usuários continuam existindo no Firebase Authentication, mas sem acesso a nada. Se quiser, apague-os também no console do Firebase.</p>}
        </>
      )}
    </Modal>
  );
}
