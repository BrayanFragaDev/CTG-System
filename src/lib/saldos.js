import { query, where, getAggregateFromServer, getDocs, sum } from 'firebase/firestore';
import { colRef } from './db';
import { arred } from './format';

const faltaIndice = (e) => e?.code === 'failed-precondition' || /requires an index/i.test(e?.message || '');

// Saldo de cada conta financeira (Caixa, Banco…) em movimentos ANTERIORES a uma data.
// Normalmente usa somas no servidor (rápido, sem baixar o histórico). Se o índice do
// banco ainda não foi publicado ou está sendo criado, soma aqui mesmo a partir dos
// lançamentos — mais lento, mas a tela funciona do mesmo jeito.
export async function saldosAntesDe(ent, contas, dataLimite) {
  try {
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
  } catch (erro) {
    if (!faltaIndice(erro)) throw erro;
    console.warn('Índice do caixa ainda não disponível; calculando o saldo localmente.');
    const snap = await getDocs(query(colRef(ent, 'caixa'), where('data', '<', dataLimite)));
    const resultado = Object.fromEntries(contas.map((c) => [c, 0]));
    snap.docs.forEach((d) => {
      const m = d.data();
      if (!(m.conta in resultado)) return;
      resultado[m.conta] += (m.tipo === 'entrada' ? 1 : -1) * (Number(m.valor) || 0);
    });
    Object.keys(resultado).forEach((c) => { resultado[c] = arred(resultado[c]); });
    return resultado;
  }
}

export const CATEGORIA_TRANSFERENCIA = 'Transferência entre contas';
