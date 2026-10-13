import { doc, writeBatch, serverTimestamp, arrayUnion, getCountFromServer, collection } from 'firebase/firestore';
import { db, auth } from './firebase';
import { colRef, docRef } from './db';
import { fmtData, fmtMoeda } from './format';

const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export const diaDaSemana = (iso) => DIAS[new Date(`${iso}T12:00:00`).getDay()];

// ---------- Público ----------
// publico: 'todos' | 'titulares' | 'categoria:<nome>' | 'invernada:<id>'
export function opcoesPublico(config, invernadas) {
  return [
    { valor: 'todos', rotulo: 'Todos os sócios ativos' },
    { valor: 'titulares', rotulo: 'Só os titulares (um por família)' },
    ...config.categoriasSocio.map((c) => ({ valor: `categoria:${c.nome}`, rotulo: `Categoria: ${c.nome}` })),
    ...invernadas.map((i) => ({ valor: `invernada:${i.id}`, rotulo: `Invernada: ${i.nome}` })),
  ];
}

export function destinatariosDe(publico, socios, invernadas) {
  const ativos = socios.filter((s) => s.situacao === 'Ativo');
  if (publico === 'todos') return ativos;
  if (publico === 'titulares') return ativos.filter((s) => !s.titularId);
  if (publico.startsWith('categoria:')) return ativos.filter((s) => s.categoria === publico.slice(10));
  if (publico.startsWith('invernada:')) {
    const inv = invernadas.find((i) => i.id === publico.slice(10));
    const ids = new Set((inv?.integrantes || []).map((i) => i.socioId));
    return socios.filter((s) => ids.has(s.id) && s.situacao !== 'Falecido');
  }
  return [];
}

// ---------- Textos prontos ----------
export function modeloEvento(evento, entidade, tipo = 'confirmado') {
  const nomeEnt = entidade?.nome || 'CTG';
  const quando = `${diaDaSemana(evento.data)}, ${fmtData(evento.data)}${evento.hora ? ` às ${evento.hora}` : ''}`;
  if (tipo === 'cancelado') {
    return {
      titulo: `Cancelado: ${evento.nome}`,
      mensagem: `⚠️ Aviso do ${nomeEnt}\n\nO evento *${evento.nome}*, marcado para ${quando}, foi CANCELADO.\n\nPedimos desculpas pelo transtorno. Quem já comprou ingresso, procure a tesouraria.`,
    };
  }
  const linhas = [
    `📣 *${nomeEnt} confirma: ${evento.nome}*`,
    '',
    `📅 ${quando.charAt(0).toUpperCase() + quando.slice(1)}`,
    evento.local && `📍 ${evento.local}`,
    evento.atracao && `🎶 ${evento.atracao}`,
    evento.traje && `👢 Traje: ${evento.traje}`,
    (evento.precoSocio != null || evento.precoNaoSocio != null)
      && `🎟️ Ingresso: ${[evento.precoSocio != null && `sócio ${fmtMoeda(evento.precoSocio)}`, evento.precoNaoSocio != null && `não sócio ${fmtMoeda(evento.precoNaoSocio)}`].filter(Boolean).join(' | ')}`,
    evento.descricao && `\n${evento.descricao}`,
    '',
    'Contamos com a presença de todos! 🧉',
  ].filter((l) => l !== false && l !== null && l !== undefined);
  return { titulo: `Confirmado: ${evento.nome}`, mensagem: linhas.join('\n') };
}

// ---------- Envio ----------
export async function publicarAviso(ent, { titulo, mensagem, publico, publicoRotulo, destinatarios, evento, tipo }) {
  const b = writeBatch(db);
  const ref = doc(colRef(ent, 'avisos'));
  const carimbo = { atualizadoEm: serverTimestamp(), atualizadoPor: auth.currentUser?.email || null, atualizadoPorUid: auth.currentUser?.uid || null };
  b.set(ref, {
    titulo: titulo.trim(), mensagem: mensagem.trim(), tipo: tipo || (evento ? 'evento' : 'geral'),
    publico, publicoRotulo, destinatarios: destinatarios.map((s) => s.id), totalDestinatarios: destinatarios.length,
    eventoId: evento?.id || null, eventoNome: evento?.nome || null, eventoData: evento?.data || null,
    enviadosWhatsapp: [], emailEnviado: false,
    criadoEm: serverTimestamp(), ...carimbo,
  });
  if (evento) b.update(docRef(ent, 'eventos', evento.id), { avisoEnviadoEm: serverTimestamp(), ultimoAvisoId: ref.id, ...carimbo });
  b.set(doc(colRef(ent, 'auditoria')), {
    acao: 'enviou aviso', colecao: 'avisos', docId: ref.id,
    resumo: `${titulo.trim()} — ${publicoRotulo} (${destinatarios.length} sócios)`.slice(0, 300),
    uid: auth.currentUser?.uid || null, email: auth.currentUser?.email || null, em: serverTimestamp(),
  });
  await b.commit();
  return ref.id;
}

export async function marcarEnviado(ent, aviso, campo, valor) {
  const b = writeBatch(db);
  b.update(docRef(ent, 'avisos', aviso.id), {
    [campo]: campo === 'enviadosWhatsapp' ? arrayUnion(valor) : valor,
    atualizadoEm: serverTimestamp(), atualizadoPor: auth.currentUser?.email || null, atualizadoPorUid: auth.currentUser?.uid || null,
  });
  await b.commit();
}

export async function contarLeituras(ent, avisoId) {
  const s = await getCountFromServer(collection(db, 'entidades', ent, 'avisos', avisoId, 'leituras'));
  return s.data().count;
}

// Sócio confirma que leu (uma vez só; as regras impedem alterar depois)
export async function registrarLeitura(ent, avisoId, socioId) {
  const b = writeBatch(db);
  b.set(doc(db, 'entidades', ent, 'avisos', avisoId, 'leituras', auth.currentUser.uid), { em: serverTimestamp(), socioId });
  await b.commit();
}

// ---------- Canais externos ----------
export function linkWhatsapp(telefone, mensagem) {
  const fone = (telefone || '').replace(/\D/g, '');
  const destino = fone ? `55${fone.replace(/^55(?=\d{10,11}$)/, '')}` : '';
  return `https://wa.me/${destino}?text=${encodeURIComponent(mensagem)}`;
}

// Abre o e-mail do usuário com os sócios em cópia oculta, em lotes
// (a maioria dos provedores limita a quantidade de destinatários por mensagem)
export function lotesEmail(socios, tamanho = 40) {
  const emails = [...new Set(socios.map((s) => (s.email || '').trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))];
  const lotes = [];
  for (let i = 0; i < emails.length; i += tamanho) lotes.push(emails.slice(i, i + tamanho));
  return lotes;
}
export function linkEmail(emails, assunto, corpo) {
  return `mailto:?bcc=${encodeURIComponent(emails.join(','))}&subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo.replace(/\*/g, ''))}`;
}
