import { useState } from 'react';
import { addDoc, collection, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { CONFIG_PADRAO } from '../lib/constantes';
import { Cabecalho, ModalForm, Selo, Vazio, useAcao, useFormulario } from '../components/ui';
import Icone from '../components/Icone';
import { CamposEntidade } from './Configuracoes';

export default function Entidades() {
  const { entidades, entidadeId, trocarEntidade } = useAuth();
  const [editando, setEditando] = useState(null);

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
                    <td>{e.ativo === false ? <Selo>Desativada</Selo> : <Selo tipo="ok">Ativa</Selo>}{e.id === entidadeId && <> <Selo tipo="info">aberta agora</Selo></>}</td>
                    <td className="acoes-celula">
                      {e.id !== entidadeId && <button type="button" className="btn btn-peq" onClick={() => trocarEntidade(e.id)}>Abrir</button>}{' '}
                      <button type="button" className="btn-link" onClick={() => setEditando(e)}>Editar</button>
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
      {editando && <FormEntidade ent={editando} aoFechar={() => setEditando(null)} aoCriar={trocarEntidade} />}
    </>
  );
}

function FormEntidade({ ent, aoFechar, aoCriar }) {
  const acao = useAcao();
  const novo = !ent.id;
  const { dados, ligar } = useFormulario({ nome: '', tipo: 'CTG', uf: 'RS', ativo: true, ...ent });

  function gravar() {
    const { id, config, criadoEm, atualizadoEm, ...resto } = dados;
    if (novo) {
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
