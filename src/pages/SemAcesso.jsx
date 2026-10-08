import { useAuth } from '../context/AuthContext';
import TelaEntrada from './TelaEntrada';

export default function SemAcesso() {
  const { user, perfil, sair } = useAuth();
  return (
    <TelaEntrada titulo="Porteira fechada." texto="Seu login existe, mas ainda não tem acesso liberado a nenhuma entidade.">
      <h2>Acesso não liberado</h2>
      <p>
        {perfil && !perfil.ativo
          ? 'Seu acesso foi desativado pela diretoria.'
          : `A conta ${user?.email} ainda não foi vinculada a uma entidade.`}
        {' '}Peça ao patrão ou ao administrador do sistema para liberar seu acesso.
      </p>
      <button type="button" className="btn" onClick={sair}>Sair</button>
    </TelaEntrada>
  );
}
