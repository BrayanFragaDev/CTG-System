import { useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { TIPOS_ENTIDADE } from '../lib/constantes';
import { Cabecalho, Campo, useAcao, useFormulario } from '../components/ui';

export function CamposEntidade({ ligar }) {
  return (
    <div className="form-grade-3">
      <Campo rotulo="Nome da entidade" className="col-2"><input {...ligar('nome', { obrigatorio: true })} /></Campo>
      <Campo rotulo="Tipo"><select {...ligar('tipo')}>{TIPOS_ENTIDADE.map((t) => <option key={t}>{t}</option>)}</select></Campo>
      <Campo rotulo="Sigla"><input placeholder="CTG QP" {...ligar('sigla')} /></Campo>
      <Campo rotulo="CNPJ"><input {...ligar('cnpj')} /></Campo>
      <Campo rotulo="Fundação"><input type="date" {...ligar('fundacao')} /></Campo>
      <Campo rotulo="Endereço" className="col-2"><input {...ligar('endereco')} /></Campo>
      <Campo rotulo="Região tradicionalista (RT)"><input type="number" min="1" max="30" {...ligar('rt')} /></Campo>
      <Campo rotulo="Cidade" className="col-2"><input {...ligar('cidade')} /></Campo>
      <Campo rotulo="UF"><input maxLength={2} {...ligar('uf')} /></Campo>
      <Campo rotulo="Telefone"><input {...ligar('telefone')} /></Campo>
      <Campo rotulo="E-mail" className="col-2"><input type="email" {...ligar('email')} /></Campo>
    </div>
  );
}

function EditorLista({ rotulo, ajuda, itens, aoMudar, placeholder }) {
  const [novo, setNovo] = useState('');
  const add = () => { const v = novo.trim(); if (v && !itens.includes(v)) aoMudar([...itens, v]); setNovo(''); };
  return (
    <div className="campo">
      <label>{rotulo}</label>
      <div className="chips">
        {itens.map((i) => <span key={i} className="chip">{i}<button type="button" aria-label={`Remover ${i}`} onClick={() => aoMudar(itens.filter((x) => x !== i))}>×</button></span>)}
      </div>
      <div style={{ display: 'flex', gap: '.5rem', marginTop: '.4rem' }}>
        <input value={novo} placeholder={placeholder} onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button type="button" className="btn" onClick={add}>Adicionar</button>
      </div>
      {ajuda && <span className="ajuda">{ajuda}</span>}
    </div>
  );
}

export default function Configuracoes() {
  const { entidade, config } = useAuth();
  if (!entidade) return null;
  return <FormConfig key={entidade.id} entidade={entidade} config={config} />;
}

function FormConfig({ entidade, config }) {
  const acao = useAcao();
  const [salvando, setSalvando] = useState(false);
  const { dados, ligar } = useFormulario({
    nome: '', tipo: 'CTG', sigla: '', cnpj: '', fundacao: '', endereco: '', rt: '', cidade: '', uf: 'RS', telefone: '', email: '', gestao: '',
    ...entidade,
  });
  const [cfg, setCfg] = useState(config);
  const [diretoria, setDiretoria] = useState(entidade.diretoria || [
    { cargo: 'Patrão', nome: '' }, { cargo: 'Capataz', nome: '' }, { cargo: 'Sota-capataz', nome: '' },
    { cargo: '1º Agregado das Pilchas (Tesoureiro)', nome: '' }, { cargo: '1º Agregado da Invernada (Secretário)', nome: '' },
  ]);
  const setC = (k, v) => setCfg((c) => ({ ...c, [k]: v }));

  async function gravar(e) {
    e.preventDefault();
    setSalvando(true);
    const { id, config: _c, criadoEm, atualizadoEm, ...resto } = dados;
    await acao(() => updateDoc(doc(db, 'entidades', entidade.id), {
      ...resto, nome: resto.nome.trim(),
      diretoria: diretoria.filter((d) => d.cargo.trim()),
      config: {
        ...cfg,
        diaVencimento: Number(cfg.diaVencimento) || 10,
        categoriasSocio: cfg.categoriasSocio.filter((c) => c.nome.trim()).map((c) => ({ nome: c.nome.trim(), valor: Number(c.valor) || 0 })),
      },
      atualizadoEm: serverTimestamp(),
    }), 'Dados da entidade salvos');
    setSalvando(false);
  }

  return (
    <form onSubmit={gravar}>
      <Cabecalho titulo="Dados da entidade" descricao="Cadastro, diretoria, valores de mensalidade e as listas usadas no financeiro.">
        <button type="submit" className="btn btn-primario" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar alterações'}</button>
      </Cabecalho>

      <section className="painel"><div className="painel-titulo"><h2>Cadastro</h2></div><div className="painel-corpo"><CamposEntidade ligar={ligar} /></div></section>
      <div className="espaco" />

      <section className="painel">
        <div className="painel-titulo"><h2>Patronagem</h2><span className="sub">Aparece nos documentos</span></div>
        <div className="painel-corpo">
          <Campo rotulo="Gestão"><input placeholder="2025/2027" {...ligar('gestao')} style={{ maxWidth: 220 }} /></Campo>
          {diretoria.map((d, i) => (
            <div key={i} className="form-grade" style={{ alignItems: 'end' }}>
              <Campo rotulo="Cargo"><input value={d.cargo} onChange={(e) => setDiretoria(diretoria.map((x, j) => (j === i ? { ...x, cargo: e.target.value } : x)))} /></Campo>
              <Campo rotulo="Nome"><div style={{ display: 'flex', gap: '.5rem' }}><input value={d.nome} onChange={(e) => setDiretoria(diretoria.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))} />
                <button type="button" className="btn btn-perigo" aria-label="Remover cargo" onClick={() => setDiretoria(diretoria.filter((_, j) => j !== i))}>×</button></div></Campo>
            </div>
          ))}
          <button type="button" className="btn btn-peq" onClick={() => setDiretoria([...diretoria, { cargo: '', nome: '' }])}>+ Cargo</button>
        </div>
      </section>
      <div className="espaco" />

      <section className="painel">
        <div className="painel-titulo"><h2>Mensalidades</h2></div>
        <div className="painel-corpo">
          <div className="form-grade">
            <Campo rotulo="Dia padrão de vencimento"><input type="number" min="1" max="31" value={cfg.diaVencimento} onChange={(e) => setC('diaVencimento', e.target.value)} /></Campo>
            <Campo rotulo="Chave PIX da entidade" ajuda="Aparece no portal do sócio e na mensagem de cobrança"><input value={cfg.chavePix} onChange={(e) => setC('chavePix', e.target.value)} /></Campo>
          </div>
          <label style={{ fontWeight: 600, color: 'var(--tinta-2)', fontSize: '.92rem' }}>Categorias de sócio e valor mensal</label>
          {cfg.categoriasSocio.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: '.5rem', marginTop: '.4rem', maxWidth: 560 }}>
              <input aria-label="Categoria" value={c.nome} onChange={(e) => setC('categoriasSocio', cfg.categoriasSocio.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))} />
              <input aria-label="Valor" type="number" step="0.01" min="0" style={{ maxWidth: 140 }} value={c.valor} onChange={(e) => setC('categoriasSocio', cfg.categoriasSocio.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))} />
              <button type="button" className="btn btn-perigo" aria-label="Remover categoria" onClick={() => setC('categoriasSocio', cfg.categoriasSocio.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <button type="button" className="btn btn-peq" style={{ marginTop: '.6rem' }} onClick={() => setC('categoriasSocio', [...cfg.categoriasSocio, { nome: '', valor: 0 }])}>+ Categoria</button>
          <p className="sub" style={{ marginTop: '.6rem', color: 'var(--tinta-3)' }}>Mudar um valor vale para as próximas mensalidades geradas; as já lançadas não mudam.</p>
        </div>
      </section>
      <div className="espaco" />

      <section className="painel">
        <div className="painel-titulo"><h2>Financeiro</h2></div>
        <div className="painel-corpo">
          <EditorLista rotulo="Contas financeiras" itens={cfg.contasFinanceiras} aoMudar={(v) => setC('contasFinanceiras', v)} placeholder="Ex.: Sicredi, Caixa da copa"
            ajuda="Onde o dinheiro fica. Não renomeie nem remova uma conta que já tem movimentos: o saldo dela deixaria de aparecer." />
          <EditorLista rotulo="Categorias de receita" itens={cfg.categoriasReceita} aoMudar={(v) => setC('categoriasReceita', v)} placeholder="Nova categoria de receita" />
          <EditorLista rotulo="Categorias de despesa" itens={cfg.categoriasDespesa} aoMudar={(v) => setC('categoriasDespesa', v)} placeholder="Nova categoria de despesa" />
        </div>
      </section>
    </form>
  );
}
