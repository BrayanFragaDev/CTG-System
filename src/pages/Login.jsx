import { useState } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { Campo, mensagemErro } from '../components/ui';
import TelaEntrada from './TelaEntrada';
import { MINUTOS_INATIVIDADE } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [verSenha, setVerSenha] = useState(false);
  const [inativo] = useState(() => {
    try { const v = sessionStorage.getItem('ctg.inatividade'); sessionStorage.removeItem('ctg.inatividade'); return Boolean(v); } catch { return false; }
  });

  async function entrar(e) {
    e.preventDefault();
    setErro(''); setAviso(''); setEnviando(true);
    try { await signInWithEmailAndPassword(auth, email.trim(), senha); }
    catch (err) { setErro(mensagemErro(err)); setEnviando(false); }
  }

  async function recuperar() {
    setErro(''); setAviso('');
    if (!email.trim()) { setErro('Digite seu e-mail no campo acima e clique de novo em "Esqueci a senha".'); return; }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setAviso(`Enviamos um link para ${email.trim()} criar uma nova senha. Confira também a caixa de spam.`);
    } catch (err) { setErro(mensagemErro(err)); }
  }

  return (
    <TelaEntrada
      titulo="O galpão em ordem, de porteira a porteira."
      texto="Sócios, mensalidades, caixa, eventos e invernadas da entidade num só lugar, com cada membro da diretoria vendo o que lhe cabe."
    >
      <h2>Entrar</h2>
      <p>Use o e-mail e a senha cadastrados pela diretoria.</p>
      {inativo && !erro && <div className="aviso info">Por segurança, sua sessão foi encerrada depois de {MINUTOS_INATIVIDADE} minutos sem uso. Entre de novo.</div>}
      {erro && <div className="aviso erro">{erro}</div>}
      {aviso && <div className="aviso info">{aviso}</div>}
      <form onSubmit={entrar}>
        <Campo rotulo="E-mail">
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </Campo>
        <div className="campo">
          <label className="campo-rotulo" htmlFor="senha-login">Senha</label>
          <div className="senha-campo">
            <input id="senha-login" type={verSenha ? 'text' : 'password'} autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
            <button type="button" onClick={() => setVerSenha(!verSenha)} aria-pressed={verSenha} aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}>{verSenha ? 'Ocultar' : 'Mostrar'}</button>
          </div>
        </div>
        <button className="btn btn-primario" style={{ width: '100%', padding: '.75rem' }} disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <button type="button" className="btn-link" style={{ marginTop: '1rem', alignSelf: 'flex-start' }} onClick={recuperar}>Esqueci a senha</button>
    </TelaEntrada>
  );
}
