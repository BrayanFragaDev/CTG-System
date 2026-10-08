// Matriz de permissões. As MESMAS regras estão em firestore.rules —
// se mudar aqui, mude lá também (o servidor é quem realmente protege os dados).

export const PAPEIS = {
  superadmin: { nome: 'Administrador do sistema', descricao: 'Acessa e administra todas as entidades.' },
  admin: { nome: 'Patrão / Presidente', descricao: 'Acesso total à entidade, inclusive usuários e configurações.' },
  tesoureiro: { nome: 'Tesoureiro', descricao: 'Mensalidades, contas, caixa, eventos e patrimônio.' },
  secretario: { nome: 'Secretário', descricao: 'Quadro social, eventos, invernadas e patrimônio.' },
  cultural: { nome: 'Coordenador artístico', descricao: 'Invernadas e eventos.' },
  consulta: { nome: 'Conselho / Consulta', descricao: 'Vê tudo, não altera nada.' },
  socio: { nome: 'Sócio', descricao: 'Vê apenas os próprios dados e mensalidades.' },
};

// Papéis que um admin de entidade pode atribuir
export const PAPEIS_ENTIDADE = ['admin', 'tesoureiro', 'secretario', 'cultural', 'consulta', 'socio'];

const ESCRITA = {
  socios: ['admin', 'secretario'],
  mensalidades: ['admin', 'tesoureiro'],
  contas: ['admin', 'tesoureiro'],
  caixa: ['admin', 'tesoureiro'],
  eventos: ['admin', 'tesoureiro', 'secretario', 'cultural'],
  invernadas: ['admin', 'secretario', 'cultural'],
  patrimonio: ['admin', 'tesoureiro', 'secretario'],
  usuarios: ['admin'],
  configuracoes: ['admin'],
};

const EQUIPE = ['admin', 'tesoureiro', 'secretario', 'cultural', 'consulta'];

export function podeLer(papel, modulo) {
  if (papel === 'superadmin') return true;
  if (modulo === 'usuarios' || modulo === 'configuracoes') return papel === 'admin';
  return EQUIPE.includes(papel);
}

export function podeEscrever(papel, modulo) {
  if (papel === 'superadmin') return true;
  return (ESCRITA[modulo] || []).includes(papel);
}
