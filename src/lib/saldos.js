import { query, where, getAggregateFromServer, sum } from 'firebase/firestore';
import { colRef } from './db';
import { arred } from './format';

// Saldo de cada conta financeira (Caixa, Banco…) em movimentos ANTERIORES a uma data.
// Usa somas no servidor do Firestore, então não precisa baixar todo o histórico.
export async function saldosAntesDe(ent, contas, dataLimite) {
  const resultado = {};
  await Promise.all(contas.map(async (conta) => {
    const somaDe = async (tipo) => {
      const q = query(colRef(ent, 'caixa'), where('conta', '==', conta), where('tipo', '==', tipo), where('data', '<', dataLimite));
      const s = await getAggregateFromServer(q, { total: sum('valor') });
      return s.data().total || 0;
    };
    const [e, s] = await Promise.all([somaDe('entrada'), somaDe('saida')]);
    resultado[conta] = arred(e - s);
  }));
  return resultado;
}

export const CATEGORIA_TRANSFERENCIA = 'Transferência entre contas';
