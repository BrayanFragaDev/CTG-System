// Testes automáticos das regras de segurança do Firestore.
// Rodam contra o emulador do Firebase (precisa de Java instalado):
//
//    npm run test:regras
//
// Cada teste tenta uma ação como um tipo de usuário e confere se o banco
// PERMITE (assertSucceeds) ou RECUSA (assertFails).

import { readFileSync } from 'node:fs';
import { describe, it, before, after, beforeEach } from 'node:test';
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, writeBatch, serverTimestamp,
} from 'firebase/firestore';

const A = 'ctgA';
const B = 'ctgB';
let env;

const carimbo = (uid) => ({ atualizadoEm: serverTimestamp(), atualizadoPorUid: uid, atualizadoPor: `${uid}@teste.com` });
const como = (uid) => env.authenticatedContext(uid, { email: `${uid}@teste.com` }).firestore();
const anonimo = () => env.unauthenticatedContext().firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ctg-inteligente',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const u = (uid, papel, entidadeId, extra = {}) => setDoc(doc(db, 'usuarios', uid), { nome: uid, email: `${uid}@teste.com`, papel, entidadeId, ativo: true, ...extra });
    await setDoc(doc(db, 'config/sistema'), { inicializado: true, superadminUid: 'super' });
    await setDoc(doc(db, 'entidades', A), { nome: 'CTG A', ativo: true });
    await setDoc(doc(db, 'entidades', B), { nome: 'CTG B', ativo: true });
    await u('super', 'superadmin', null);
    await u('patrao', 'admin', A);
    await u('tesoureiro', 'tesoureiro', A);
    await u('secretario', 'secretario', A);
    await u('cultural', 'cultural', A);
    await u('conselho', 'consulta', A);
    await u('joao', 'socio', A, { socioId: 's1' });
    await u('maria', 'socio', A, { socioId: 's2' });
    await u('patraoB', 'admin', B);
    await u('inativo', 'tesoureiro', A, { ativo: false });
    await u('valdir', 'copa', A);
    await setDoc(doc(db, `entidades/${A}/produtos/p1`), { nome: 'Cerveja', precoVenda: 8, precoCusto: 4, estoque: 48 });
    await setDoc(doc(db, `entidades/${A}/copa/k1`), { data: '2026-10-13', status: 'fechada', itens: [] });
    await setDoc(doc(db, `entidades/${A}/socios/s1`), { nome: 'João', situacao: 'Ativo' });
    await setDoc(doc(db, `entidades/${A}/socios/s2`), { nome: 'Maria', situacao: 'Ativo' });
    await setDoc(doc(db, `entidades/${A}/socios/s1/privado/dados`), { cpf: '123.456.789-00', entidadeId: A, socioId: 's1' });
    await setDoc(doc(db, `entidades/${A}/mensalidades/m1`), { socioId: 's1', competencia: '2026-10', vencimento: '2026-10-10', valor: 40, status: 'aberto' });
    await setDoc(doc(db, `entidades/${A}/mensalidades/m2`), { socioId: 's2', competencia: '2026-10', vencimento: '2026-10-10', valor: 40, status: 'aberto' });
    await setDoc(doc(db, `entidades/${A}/caixa/c1`), { tipo: 'entrada', valor: 40, data: '2026-10-01', conta: 'Caixa', descricao: 'Teste' });
    await setDoc(doc(db, `entidades/${A}/avisos/av1`), { titulo: 'Baile', mensagem: 'Confirmado', destinatarios: ['s1'] });
    await setDoc(doc(db, `entidades/${A}/auditoria/log1`), { acao: 'criou', resumo: 'x', uid: 'tesoureiro', em: new Date() });
  });
});

describe('acesso básico', () => {
  it('visitante sem login não lê nada da entidade', async () => {
    await assertFails(getDoc(doc(anonimo(), `entidades/${A}/socios/s1`)));
    await assertFails(getDoc(doc(anonimo(), `entidades/${A}`)));
  });
  it('conta criada por fora, sem perfil, não lê nada', async () => {
    await assertFails(getDoc(doc(como('estranho'), `entidades/${A}/caixa/c1`)));
  });
  it('usuário desativado não lê nada', async () => {
    await assertFails(getDoc(doc(como('inativo'), `entidades/${A}/caixa/c1`)));
  });
  it('patrão de outra entidade não lê dados desta', async () => {
    await assertFails(getDoc(doc(como('patraoB'), `entidades/${A}/socios/s1`)));
    await assertFails(getDocs(collection(como('patraoB'), `entidades/${A}/mensalidades`)));
  });
  it('entidade desativada bloqueia os próprios membros', async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), `entidades/${A}`), { ativo: false }));
    await assertFails(getDoc(doc(como('tesoureiro'), `entidades/${A}/caixa/c1`)));
  });
});

describe('papéis', () => {
  const lanc = (uid) => ({ tipo: 'saida', valor: 10, data: '2026-10-05', conta: 'Caixa', descricao: 'Gelo', ...carimbo(uid) });
  it('tesoureiro lança no caixa com carimbo', async () => {
    await assertSucceeds(setDoc(doc(como('tesoureiro'), `entidades/${A}/caixa/novo`), lanc('tesoureiro')));
  });
  it('tesoureiro NÃO grava sem carimbo de autoria', async () => {
    const { atualizadoPorUid, ...semCarimbo } = lanc('tesoureiro');
    await assertFails(setDoc(doc(como('tesoureiro'), `entidades/${A}/caixa/novo`), semCarimbo));
  });
  it('ninguém assina em nome de outro', async () => {
    await assertFails(setDoc(doc(como('tesoureiro'), `entidades/${A}/caixa/novo`), lanc('patrao')));
  });
  it('secretário e conselho não mexem no caixa', async () => {
    await assertFails(setDoc(doc(como('secretario'), `entidades/${A}/caixa/novo`), lanc('secretario')));
    await assertFails(setDoc(doc(como('conselho'), `entidades/${A}/caixa/novo`), lanc('conselho')));
  });
  it('conselho lê o caixa, mas não altera', async () => {
    await assertSucceeds(getDoc(doc(como('conselho'), `entidades/${A}/caixa/c1`)));
    await assertFails(updateDoc(doc(como('conselho'), `entidades/${A}/caixa/c1`), { valor: 1, ...carimbo('conselho') }));
  });
  it('valor negativo ou data inválida são recusados', async () => {
    await assertFails(setDoc(doc(como('tesoureiro'), `entidades/${A}/caixa/x`), { ...lanc('tesoureiro'), valor: -50 }));
    await assertFails(setDoc(doc(como('tesoureiro'), `entidades/${A}/caixa/y`), { ...lanc('tesoureiro'), data: '31/12/2026' }));
  });
});

describe('exclusões e registro de atividades', () => {
  it('excluir do caixa SEM registrar a atividade é recusado', async () => {
    await assertFails(deleteDoc(doc(como('tesoureiro'), `entidades/${A}/caixa/c1`)));
  });
  it('excluir do caixa registrando no mesmo lote é aceito', async () => {
    const db = como('tesoureiro');
    const b = writeBatch(db);
    b.set(doc(db, `entidades/${A}/auditoria/del_caixa_c1`), { acao: 'excluiu', colecao: 'caixa', docId: 'c1', resumo: 'teste', uid: 'tesoureiro', email: 'tesoureiro@teste.com', em: serverTimestamp() });
    b.delete(doc(db, `entidades/${A}/caixa/c1`));
    await assertSucceeds(b.commit());
  });
  it('o registro de atividades não pode ser alterado nem apagado', async () => {
    await assertFails(updateDoc(doc(como('patrao'), `entidades/${A}/auditoria/log1`), { resumo: 'apagando rastros' }));
    await assertFails(deleteDoc(doc(como('patrao'), `entidades/${A}/auditoria/log1`)));
  });
  it('ninguém registra atividade em nome de outro', async () => {
    await assertFails(setDoc(doc(como('tesoureiro'), `entidades/${A}/auditoria/falso`), { acao: 'x', resumo: 'x', uid: 'patrao', em: serverTimestamp() }));
  });
  it('tesoureiro não lê o registro; conselho lê', async () => {
    await assertFails(getDoc(doc(como('tesoureiro'), `entidades/${A}/auditoria/log1`)));
    await assertSucceeds(getDoc(doc(como('conselho'), `entidades/${A}/auditoria/log1`)));
  });
});

describe('dados pessoais (LGPD)', () => {
  it('tesoureiro e conselho NÃO leem CPF', async () => {
    await assertFails(getDoc(doc(como('tesoureiro'), `entidades/${A}/socios/s1/privado/dados`)));
    await assertFails(getDoc(doc(como('conselho'), `entidades/${A}/socios/s1/privado/dados`)));
  });
  it('secretário e o próprio sócio leem', async () => {
    await assertSucceeds(getDoc(doc(como('secretario'), `entidades/${A}/socios/s1/privado/dados`)));
    await assertSucceeds(getDoc(doc(como('joao'), `entidades/${A}/socios/s1/privado/dados`)));
  });
  it('outro sócio não lê', async () => {
    await assertFails(getDoc(doc(como('maria'), `entidades/${A}/socios/s1/privado/dados`)));
  });
  it('CPF no cadastro principal é recusado', async () => {
    await assertFails(setDoc(doc(como('secretario'), `entidades/${A}/socios/s9`), { nome: 'X', situacao: 'Ativo', cpf: '111', ...carimbo('secretario') }));
  });
});

describe('portal do sócio', () => {
  it('sócio lê as próprias mensalidades', async () => {
    const db = como('joao');
    await assertSucceeds(getDocs(query(collection(db, `entidades/${A}/mensalidades`), where('socioId', '==', 's1'))));
  });
  it('sócio NÃO lê as mensalidades dos outros', async () => {
    const db = como('joao');
    await assertFails(getDoc(doc(db, `entidades/${A}/mensalidades/m2`)));
    await assertFails(getDocs(collection(db, `entidades/${A}/mensalidades`)));
  });
  it('sócio não lê o caixa nem a lista de sócios', async () => {
    await assertFails(getDoc(doc(como('joao'), `entidades/${A}/caixa/c1`)));
    await assertFails(getDocs(collection(como('joao'), `entidades/${A}/socios`)));
  });
  it('sócio lê os avisos dirigidos a ele', async () => {
    const db = como('joao');
    await assertSucceeds(getDocs(query(collection(db, `entidades/${A}/avisos`), where('destinatarios', 'array-contains', 's1'))));
  });
  it('sócio não lê aviso que não é para ele', async () => {
    await assertFails(getDoc(doc(como('maria'), `entidades/${A}/avisos/av1`)));
  });
  it('sócio confirma a própria leitura uma vez; não altera depois', async () => {
    const db = como('joao');
    const ref = doc(db, `entidades/${A}/avisos/av1/leituras/joao`);
    await assertSucceeds(setDoc(ref, { em: serverTimestamp(), socioId: 's1' }));
    await assertFails(updateDoc(ref, { em: serverTimestamp() }));
  });
  it('sócio não marca leitura em nome de outro', async () => {
    await assertFails(setDoc(doc(como('joao'), `entidades/${A}/avisos/av1/leituras/maria`), { em: serverTimestamp(), socioId: 's1' }));
  });
});

describe('brasão e foto', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const foto = (uid, socioId) => ({ imagem: png, entidadeId: A, socioId, ...carimbo(uid) });
  it('sócio troca a própria foto', async () => {
    await assertSucceeds(setDoc(doc(como('joao'), `entidades/${A}/socios/s1/foto/atual`), foto('joao', 's1')));
  });
  it('sócio NÃO troca a foto de outro', async () => {
    await assertFails(setDoc(doc(como('joao'), `entidades/${A}/socios/s2/foto/atual`), foto('joao', 's2')));
  });
  it('tesoureiro vê a foto mas não troca', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `entidades/${A}/socios/s1/foto/atual`), { imagem: png, entidadeId: A, socioId: 's1' }));
    await assertSucceeds(getDoc(doc(como('tesoureiro'), `entidades/${A}/socios/s1/foto/atual`)));
    await assertFails(setDoc(doc(como('tesoureiro'), `entidades/${A}/socios/s1/foto/atual`), foto('tesoureiro', 's1')));
  });
  it('arquivo que não é imagem é recusado', async () => {
    await assertFails(setDoc(doc(como('secretario'), `entidades/${A}/socios/s1/foto/atual`), { ...foto('secretario', 's1'), imagem: 'data:text/html;base64,PHNjcmlwdD4=' }));
  });
  it('patrão grava o brasão; brasão gigante é recusado', async () => {
    await assertSucceeds(updateDoc(doc(como('patrao'), `entidades/${A}`), { nome: 'CTG A', logo: png }));
    await assertFails(updateDoc(doc(como('patrao'), `entidades/${A}`), { nome: 'CTG A', logo: png + 'A'.repeat(300000) }));
  });
});

describe('copa e estoque', () => {
  const mov = (uid, tipo) => ({ tipo, produtoId: 'p1', quantidade: 2, data: '2026-10-13', ...carimbo(uid) });
  it('responsável pela copa não vê caixa nem sócios', async () => {
    await assertFails(getDoc(doc(como('valdir'), `entidades/${A}/caixa/c1`)));
    await assertFails(getDocs(collection(como('valdir'), `entidades/${A}/socios`)));
  });
  it('responsável pela copa conta o estoque, mas não muda preço', async () => {
    await assertSucceeds(updateDoc(doc(como('valdir'), `entidades/${A}/produtos/p1`), { estoque: 40, ...carimbo('valdir') }));
    await assertFails(updateDoc(doc(como('valdir'), `entidades/${A}/produtos/p1`), { precoVenda: 1, ...carimbo('valdir') }));
  });
  it('responsável pela copa registra venda, não registra compra', async () => {
    await assertSucceeds(setDoc(doc(como('valdir'), `entidades/${A}/movEstoque/m1`), mov('valdir', 'venda')));
    await assertFails(setDoc(doc(como('valdir'), `entidades/${A}/movEstoque/m2`), mov('valdir', 'compra')));
  });
  it('movimento de estoque não pode ser alterado', async () => {
    await assertSucceeds(setDoc(doc(como('tesoureiro'), `entidades/${A}/movEstoque/m3`), mov('tesoureiro', 'compra')));
    await assertFails(updateDoc(doc(como('tesoureiro'), `entidades/${A}/movEstoque/m3`), { quantidade: 1, ...carimbo('tesoureiro') }));
  });
  it('copa fechada: o responsável não mexe mais e não confere', async () => {
    await assertFails(updateDoc(doc(como('valdir'), `entidades/${A}/copa/k1`), { status: 'aberta', ...carimbo('valdir') }));
    await assertFails(updateDoc(doc(como('valdir'), `entidades/${A}/copa/k1`), { status: 'conferida', ...carimbo('valdir') }));
    await assertSucceeds(updateDoc(doc(como('tesoureiro'), `entidades/${A}/copa/k1`), { status: 'conferida', ...carimbo('tesoureiro') }));
  });
});

describe('usuários', () => {
  it('patrão não se promove nem cria administrador do sistema', async () => {
    await assertFails(updateDoc(doc(como('patrao'), 'usuarios/patrao'), { papel: 'superadmin' }));
    await assertFails(setDoc(doc(como('patrao'), 'usuarios/novo'), { nome: 'x', papel: 'superadmin', entidadeId: A, ativo: true }));
  });
  it('patrão cria tesoureiro na própria entidade, não na alheia', async () => {
    await assertSucceeds(setDoc(doc(como('patrao'), 'usuarios/novo'), { nome: 'x', papel: 'tesoureiro', entidadeId: A, ativo: true }));
    await assertFails(setDoc(doc(como('patrao'), 'usuarios/novo2'), { nome: 'x', papel: 'tesoureiro', entidadeId: B, ativo: true }));
  });
  it('ninguém reinstala o sistema por cima', async () => {
    await assertFails(setDoc(doc(como('estranho'), 'config/sistema'), { inicializado: true, superadminUid: 'estranho' }));
  });
});
