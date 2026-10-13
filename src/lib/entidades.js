import { collection, collectionGroup, query, where, limit, getDocs, getCountFromServer, writeBatch, doc } from 'firebase/firestore';
import { db } from './firebase';

export const SUBCOLECOES = [
  ['socios', 'sócios'], ['mensalidades', 'mensalidades'], ['contas', 'contas'], ['caixa', 'lançamentos de caixa'],
  ['eventos', 'eventos'], ['invernadas', 'invernadas'], ['patrimonio', 'itens de patrimônio'],
  ['avisos', 'avisos enviados'], ['produtos', 'produtos da copa'], ['movEstoque', 'movimentos de estoque'],
  ['copa', 'fechamentos de copa'], ['auditoria', 'registros de atividade'],
];

// Quantos registros a entidade tem em cada módulo (e quantos usuários)
export async function contarRegistros(ent) {
  const contagens = await Promise.all(SUBCOLECOES.map(async ([nome, rotulo]) => {
    const s = await getCountFromServer(collection(db, 'entidades', ent, nome));
    return { nome, rotulo, total: s.data().count };
  }));
  const u = await getCountFromServer(query(collection(db, 'usuarios'), where('entidadeId', '==', ent)));
  contagens.push({ nome: 'usuarios', rotulo: 'acessos de usuários', total: u.data().count });
  return contagens;
}

async function apagarConsulta(q, aoApagar) {
  // apaga em blocos de 400 até não sobrar nada
  for (;;) {
    const s = await getDocs(query(q, limit(400)));
    if (s.empty) return;
    const lote = writeBatch(db);
    s.docs.forEach((d) => lote.delete(d.ref));
    await lote.commit();
    aoApagar(s.size);
  }
}

// O Firestore não apaga subcoleções junto com o documento, então
// apagamos módulo por módulo, depois os acessos e por fim a entidade.
export async function excluirEntidade(ent, aoProgresso = () => {}) {
  let feitos = 0;
  const conta = (n) => { feitos += n; aoProgresso(feitos); };
  // áreas protegidas dos sócios (CPF/endereço) e leituras dos avisos ficam em subcoleções
  await apagarConsulta(query(collectionGroup(db, 'privado'), where('entidadeId', '==', ent)), conta);
  // fotos dos sócios (caminho conhecido: socios/{id}/foto/atual)
  const socios = await getDocs(collection(db, 'entidades', ent, 'socios'));
  for (let i = 0; i < socios.docs.length; i += 400) {
    const lote = writeBatch(db);
    socios.docs.slice(i, i + 400).forEach((d) => lote.delete(doc(d.ref, 'foto', 'atual')));
    await lote.commit();
  }
  const avisos = await getDocs(collection(db, 'entidades', ent, 'avisos'));
  for (const a of avisos.docs) await apagarConsulta(collection(a.ref, 'leituras'), conta);
  for (const [nome] of SUBCOLECOES) {
    await apagarConsulta(collection(db, 'entidades', ent, nome), conta);
  }
  await apagarConsulta(query(collection(db, 'usuarios'), where('entidadeId', '==', ent)), conta);
  const lote = writeBatch(db);
  lote.delete(doc(db, 'entidades', ent));
  await lote.commit();
}
