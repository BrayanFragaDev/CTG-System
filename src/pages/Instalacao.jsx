import { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, collection, writeBatch, serverTimestamp, addDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { CONFIG_PADRAO, TIPOS_ENTIDADE } from '../lib/constantes';
import { Campo, mensagemErro, useFormulario } from '../components/ui';
import TelaEntrada from './TelaEntrada';

export default function Instalacao() {
  const { dados, ligar } = useFormulario({ nome: '', email: '', senha: '', entidade: '', tipo: 'CTG', cidade: '', rt: '' });
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function instalar(e) {
    e.preventDefault();
    setErro(''); setEnviando(true);
    try {
      let usuario = auth.currentUser;
      if (!usuario) usuario = (await createUserWithEmailAndPassword(auth, dados.email.trim(), dados.senha)).user;
      const lote = writeBatch(db);
      lote.set(doc(db, 'config', 'sistema'), { inicializado: true, superadminUid: usuario.uid, criadoEm: serverTimestamp() });
      lote.set(doc(db, 'usuarios', usuario.uid), {
        nome: dados.nome.trim(), email: usuario.email, papel: 'superadmin', entidadeId: null, ativo: true, criadoEm: serverTimestamp(),
      });
      await lote.commit();
      if (dados.entidade.trim()) {
        await addDoc(collection(db, 'entidades'), {
          nome: dados.entidade.trim(), tipo: dados.tipo, cidade: dados.cidade.trim(), rt: dados.rt,
          config: CONFIG_PADRAO, ativo: true, criadoEm: serverTimestamp(),
        });
      }
    } catch (err) {
      console.error(err);
      setErro(err.code === 'permission-denied'
        ? 'O banco recusou a gravação. Publique as regras de segurança (firestore.rules) antes de instalar — veja o README.'
        : mensagemErro(err));
      setEnviando(false);
    }
  }

  return (
    <TelaEntrada
      titulo="Primeira encilha."
      texto="Este é o primeiro acesso ao sistema. Quem fizer este cadastro será o administrador geral: poderá criar entidades e dar acesso às diretorias."
    >
      <h2>Instalar o sistema</h2>
      <p>Leva um minuto. Depois você cadastra a diretoria e os sócios.</p>
      {erro && <div className="aviso erro">{erro}</div>}
      <form onSubmit={instalar}>
        <div className="secao-form">Administrador</div>
        <Campo rotulo="Seu nome"><input {...ligar('nome', { obrigatorio: true })} autoFocus /></Campo>
        {!auth.currentUser && (
          <div className="form-grade">
            <Campo rotulo="E-mail"><input type="email" {...ligar('email', { obrigatorio: true })} /></Campo>
            <Campo rotulo="Senha" ajuda="Mínimo de 6 caracteres"><input type="password" minLength={6} {...ligar('senha', { obrigatorio: true })} /></Campo>
          </div>
        )}
        <div className="secao-form">Primeira entidade</div>
        <div className="form-grade">
          <Campo rotulo="Nome" className="col-2"><input placeholder="CTG Querência do Pago" {...ligar('entidade', { obrigatorio: true })} /></Campo>
          <Campo rotulo="Tipo"><select {...ligar('tipo')}>{TIPOS_ENTIDADE.map((t) => <option key={t}>{t}</option>)}</select></Campo>
          <Campo rotulo="Região tradicionalista"><input type="number" min="1" max="30" placeholder="ex.: 1" {...ligar('rt')} /></Campo>
          <Campo rotulo="Cidade" className="col-2"><input {...ligar('cidade')} /></Campo>
        </div>
        <button className="btn btn-primario" style={{ width: '100%', padding: '.75rem' }} disabled={enviando}>
          {enviando ? 'Instalando…' : 'Instalar e entrar'}
        </button>
      </form>
    </TelaEntrada>
  );
}
