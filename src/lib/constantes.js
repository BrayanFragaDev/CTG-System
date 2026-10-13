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

export const CATEGORIAS_PRODUTO = ['Bebidas', 'Comidas', 'Doces', 'Fichas e ingressos', 'Outros'];
export const UNIDADES = ['un', 'lata', 'garrafa', 'long neck', 'pacote', 'kg', 'caixa'];

// Sugestão para começar: o patrão ajusta preços e tira o que não usa
export const PRODUTOS_SUGERIDOS = [
  { nome: 'Cerveja lata 350 ml', categoria: 'Bebidas', unidade: 'lata' },
  { nome: 'Cerveja garrafa 600 ml', categoria: 'Bebidas', unidade: 'garrafa' },
  { nome: 'Refrigerante lata 350 ml', categoria: 'Bebidas', unidade: 'lata' },
  { nome: 'Refrigerante 2 L', categoria: 'Bebidas', unidade: 'garrafa' },
  { nome: 'Água sem gás 500 ml', categoria: 'Bebidas', unidade: 'garrafa' },
  { nome: 'Água com gás 500 ml', categoria: 'Bebidas', unidade: 'garrafa' },
  { nome: 'Doce / sobremesa', categoria: 'Doces', unidade: 'un' },
];
