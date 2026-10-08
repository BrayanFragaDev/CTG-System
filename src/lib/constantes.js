export const CONFIG_PADRAO = {
  categoriasSocio: [
    { nome: 'Sócio titular', valor: 40 },
    { nome: 'Sócio familiar', valor: 60 },
    { nome: 'Dependente', valor: 0 },
    { nome: 'Peão/prenda de invernada', valor: 20 },
    { nome: 'Sócio benemérito', valor: 0 },
  ],
  diaVencimento: 10,
  chavePix: '',
  contasFinanceiras: ['Caixa (dinheiro)', 'Conta bancária'],
  categoriasReceita: [
    'Mensalidades', 'Bailes e fandangos', 'Rodeios', 'Copa e bar', 'Jantares e almoços',
    'Rifas e promoções', 'Doações', 'Patrocínios', 'Aluguel do galpão', 'Subvenções', 'Outras receitas',
  ],
  categoriasDespesa: [
    'Energia elétrica', 'Água', 'Internet e telefone', 'Manutenção do galpão', 'Conjunto musical',
    'Cachês e instrutores', 'Pilchas e figurinos', 'Copa e bar (compras)', 'Taxas MTG / RT',
    'Viagens e rodeios', 'Limpeza', 'Material de expediente', 'Impostos e taxas', 'Outras despesas',
  ],
};

export function configEntidade(ent) {
  return { ...CONFIG_PADRAO, ...(ent?.config || {}) };
}

export const FORMAS_PAGAMENTO = ['PIX', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito', 'Transferência', 'Boleto', 'Cheque'];

export const SITUACOES_SOCIO = ['Ativo', 'Licenciado', 'Inativo', 'Falecido'];

export const TIPOS_ENTIDADE = ['CTG', 'Piquete', 'DTG', 'Grupo de Arte Nativa', 'Associação'];

export const TIPOS_EVENTO = ['Baile', 'Fandango', 'Rodeio', 'Jantar / almoço', 'Festival', 'Semana Farroupilha', 'Reunião / assembleia', 'Ensaio aberto', 'Outro'];

export const CATEGORIAS_INVERNADA = ['Pré-mirim', 'Mirim', 'Juvenil', 'Adulta', 'Veterana', 'Xiru', 'Chula', 'Declamação', 'Música', 'Outra'];

export const CATEGORIAS_PATRIMONIO = ['Pilcha / indumentária', 'Instrumento musical', 'Equipamento de som', 'Móvel', 'Utensílio de cozinha', 'Encilha / arreio', 'Troféu', 'Imóvel', 'Veículo', 'Outro'];

export const ESTADOS_PATRIMONIO = ['Novo', 'Bom', 'Regular', 'Ruim', 'Baixado'];
