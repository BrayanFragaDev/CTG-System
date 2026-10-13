import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc, updateDoc, deleteDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useAuth } from '../context/AuthContext';
import { db, auth, criarContaLogin } from '../lib/firebase';
import { useColecao, registrarAtividade } from '../lib/db';
import { PAPEIS, PAPEIS_ENTIDADE } from '../lib/permissoes';
import { AvisoErro, Cabecalho, Campo, Carregando, ModalForm, Selo, Vazio, useAcao, useFormulario, mensagemErro } from '../components/ui';
import Icone from '../components/Icone';

export default function Usuarios() {
  const { entidadeId, perfil } = useAuth();
  const [usuarios, setUsuarios] = useState(null);
  const [erro, setErro] = useState(null);
  const [editando, setEditando] = useState(null);
  const acao = useAcao();

  useEffect(() => {
    if (!entidadeId) return undefined;
    return onSnapshot(query(collection(db, 'usuarios'), where('entidadeId', '==', entidadeId)),
      (s) => setUsuarios(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))),
      (e) => { setErro(e); setUsuarios([]); });
  }, [entidadeId]);

  const equipe = (usuarios || []).filter((u) => u.papel !== 'socio');
  const socios = (usuarios || []).filter((u) => u.papel === 'socio');

  const redefinir = (u) => acao(() => sendPasswordResetEmail(auth, u.email), `Enviamos a ${u.email} um link para criar nova senha`);

  const Linhas = ({ lista }) => lista.map((u) => (
    <tr key={u.id}>
      <td><strong>{u.nome}</strong><span className="sub">{u.email}</span></td>
      <td>{PAPEIS[u.papel]?.nome}{u.socioNome && <span className="sub">Sócio: {u.socioNome}</span>}</td>
      <td>{u.ativo ? <Selo tipo="ok">Ativo</Selo> : <Selo>Desativado</Selo>}</td>
      <td className="acoes-celula">
        <button type="button" className="btn-link" onClick={() => redefinir(u)}>Enviar nova senha</button>{' '}
        {u.id !== perfil.id && <button type="button" className="btn btn-peq" onClick={() => setEditando(u)}>Editar</button>}
      </td>
    </tr>
  ));

  return (
    <>
      <Cabecalho titulo="Usuários e acessos" descricao="Quem entra no sistema e o que cada um pode fazer.">
        <button type="button" className="btn btn-primario" onClick={() => setEditando({})}><Icone nome="mais" tam={18} />Novo acesso</button>
      </Cabecalho>
      <AvisoErro erro={erro} />
      <div className="painel">
        <div className="painel-titulo"><h2>Diretoria e equipe</h2></div>
        {usuarios === null ? <Carregando /> : equipe.length === 0 ? <Vazio titulo="Nenhum membro da diretoria com acesso">Dê acesso ao tesoureiro e ao secretário para dividirem o trabalho.</Vazio> : (
          <div className="tabela-wrap"><table><thead><tr><th>Nome</th><th>Papel</th><th>Situação</th><th /></tr></thead><tbody><Linhas lista={equipe} /></tbody></table></div>
        )}
      </div>
      <div className="espaco" />
      <div className="painel">
        <div className="painel-titulo"><h2>Portal do sócio</h2><span className="sub">{socios.length} sócio(s) com acesso</span></div>
        {usuarios === null ? <Carregando /> : socios.length === 0 ? <Vazio titulo="Nenhum sócio com acesso ao portal">No portal o sócio vê as próprias mensalidades, baixa recibos e acompanha a agenda.</Vazio> : (
          <div className="tabela-wrap"><table><thead><tr><th>Nome</th><th>Papel</th><th>Situação</th><th /></tr></thead><tbody><Linhas lista={socios} /></tbody></table></div>
        )}
      </div>
      <div className="espaco" />
      <div className="painel">
        <div className="painel-titulo"><h2>O que cada papel pode fazer</h2></div>
        <div className="painel-corpo">
          <ul className="lista-simples">
            {PAPEIS_ENTIDADE.map((p) => <li key={p}><strong>{PAPEIS[p].nome}</strong><span style={{ textAlign: 'right', color: 'var(--tinta-2)' }}>{PAPEIS[p].descricao}</span></li>)}
          </ul>
        </div>
      </div>
      {editando && <FormUsuario usuario={editando} aoFechar={() => setEditando(null)} acao={acao} />}
    </>
  );
}

function FormUsuario({ usuario, aoFechar, acao }) {
  const { entidadeId } = useAuth();
  const novo = !usuario.id;
  const socios = useColecao(entidadeId, 'socios', [orderBy('nome')]);
  const { dados, ligar, setDados } = useFormulario({ papel: 'tesoureiro', ativo: true, senha: '', socioId: '', ...usuario });
  const ehSocio = dados.papel === 'socio';

  function escolherSocio(e) {
    const s = socios.dados.find((x) => x.id === e.target.value);
    setDados({ ...dados, socioId: e.target.value, ...(s && novo ? { nome: dados.nome || s.nome, email: dados.email || s.email || '' } : {}) });
  }

  async function gravar() {
    if (ehSocio && !dados.socioId) throw new Error('Escolha a qual sócio este acesso pertence.');
    const s = socios.dados.find((x) => x.id === dados.socioId);
    const perfil = {
      nome: dados.nome.trim(), papel: dados.papel, ativo: Boolean(dados.ativo), entidadeId,
      socioId: ehSocio ? dados.socioId : null, socioNome: ehSocio ? s?.nome || null : null,
    };
    if (!novo) {
      return acao(async () => {
        await updateDoc(doc(db, 'usuarios', usuario.id), perfil);
        await registrarAtividade(entidadeId, 'alterou acesso', `${perfil.nome} (${usuario.email}): ${PAPEIS[perfil.papel].nome}${perfil.ativo ? '' : ', desativado'}`).catch(() => {});
      }, 'Acesso atualizado');
    }
    const problema = senhaFraca(dados.senha);
    if (problema) throw new Error(problema);
    return acao(async () => {
      const email = dados.email.trim().toLowerCase();
      const uid = await criarContaLogin(email, dados.senha);
      await setDoc(doc(db, 'usuarios', uid), { ...perfil, email, criadoEm: serverTimestamp() });
      await registrarAtividade(entidadeId, 'liberou acesso', `${perfil.nome} (${email}) como ${PAPEIS[perfil.papel].nome}`).catch(() => {});
    }, `Acesso criado. Passe a ${dados.email} a senha provisória.`);
  }

  async function remover() {
    if (!window.confirm(`Remover o acesso de ${usuario.nome}? A pessoa não conseguirá mais entrar nesta entidade.`)) return;
    if (await acao(async () => {
      await deleteDoc(doc(db, 'usuarios', usuario.id));
      await registrarAtividade(entidadeId, 'removeu acesso', `${usuario.nome} (${usuario.email})`).catch(() => {});
    }, 'Acesso removido')) aoFechar();
  }

  return (
    <ModalForm titulo={novo ? 'Novo acesso' : `Editar acesso de ${usuario.nome}`} aoFechar={aoFechar} aoSalvar={gravar}
      textoSalvar={novo ? 'Criar acesso' : 'Salvar'}
      extraRodape={!novo && <button type="button" className="btn btn-perigo" onClick={remover}>Remover acesso</button>}>
      <div className="form-grade">
        <Campo rotulo="Papel" className="col-2" ajuda={PAPEIS[dados.papel]?.descricao}>
          <select {...ligar('papel')}>{PAPEIS_ENTIDADE.map((p) => <option key={p} value={p}>{PAPEIS[p].nome}</option>)}</select>
        </Campo>
        {ehSocio && (
          <Campo rotulo="Sócio" className="col-2">
            <select value={dados.socioId} onChange={escolherSocio} required>
              <option value="">Escolha o sócio…</option>
              {socios.dados.map((s) => <option key={s.id} value={s.id}>{s.nome}{s.matricula ? ` (${s.matricula})` : ''}</option>)}
            </select>
          </Campo>
        )}
        <Campo rotulo="Nome" className="col-2"><input {...ligar('nome', { obrigatorio: true })} /></Campo>
        {novo && <>
          <Campo rotulo="E-mail de login"><input type="email" {...ligar('email', { obrigatorio: true })} /></Campo>
          <div className="campo">
            <label className="campo-rotulo" htmlFor="senha-prov">Senha provisória</label>
            <div style={{ display: 'flex', gap: '.5rem' }}>
              <input id="senha-prov" type="text" minLength={8} autoComplete="new-password" spellCheck={false} {...ligar('senha', { obrigatorio: true })} />
              <button type="button" className="btn" onClick={() => setDados({ ...dados, senha: gerarSenha() })}>Gerar</button>
            </div>
            <span className="ajuda">Pelo menos 8 caracteres, com letras e números. A pessoa troca depois em “Esqueci a senha”.</span>
          </div>
        </>}
        {!novo && <div className="col-2" style={{ marginBottom: '1rem' }}><label className="checkbox"><input type="checkbox" checked={Boolean(dados.ativo)} onChange={ligar('ativo').onChange} />Acesso ativo</label></div>}
      </div>
    </ModalForm>
  );
}

export function senhaFraca(senha) {
  if (!senha || senha.length < 8) return 'A senha provisória precisa ter pelo menos 8 caracteres.';
  if (!/[a-zA-Z]/.test(senha) || !/[0-9]/.test(senha)) return 'A senha provisória precisa misturar letras e números.';
  if (/^(12345678|password|senha123|abc12345)/i.test(senha)) return 'Essa senha é fácil demais de adivinhar. Use o botão Gerar.';
  return null;
}

// Senha legível (sem 0/O, 1/l) para ditar por telefone
export function gerarSenha() {
  const letras = 'abcdefghjkmnpqrstuvwxyz';
  const numeros = '23456789';
  const r = new Uint32Array(10);
  crypto.getRandomValues(r);
  const pick = (conj, i) => conj[r[i] % conj.length];
  return `${pick(letras, 0).toUpperCase()}${pick(letras, 1)}${pick(letras, 2)}${pick(letras, 3)}-${pick(numeros, 4)}${pick(numeros, 5)}${pick(numeros, 6)}${pick(numeros, 7)}`;
}
