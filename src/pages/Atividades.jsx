import { useMemo, useState } from 'react';
import { orderBy, limit, where } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useColecao } from '../lib/db';
import { normalizar, hoje } from '../lib/format';
import { relatorioPdf } from '../lib/pdf';
import { Cabecalho, Campo, Carregando, ErroLeitura, Selo, Vazio } from '../components/ui';
import Icone from '../components/Icone';

const COR_ACAO = {
  excluiu: 'atraso', estornou: 'atraso', 'removeu acesso': 'atraso',
  recebeu: 'ok', pagou: 'ok', criou: 'info', 'criou em lote': 'info', 'liberou acesso': 'info',
  exportou: 'pendente', protegeu: 'ok', 'enviou aviso': 'info', 'alterou acesso': 'pendente',
};

function quando(ts) {
  if (!ts?.seconds) return '…';
  return new Date(ts.seconds * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Atividades() {
  const { entidadeId, entidade } = useAuth();
  const [desde, setDesde] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); });
  const [busca, setBusca] = useState('');
  const [pessoa, setPessoa] = useState('');
  const [acao, setAcao] = useState('');
  const inicio = new Date(`${desde}T00:00:00`);
  const { dados, carregando, erro } = useColecao(entidadeId, 'auditoria',
    [where('em', '>=', inicio), orderBy('em', 'desc'), limit(500)], desde);

  const pessoas = [...new Set(dados.map((d) => d.email).filter(Boolean))].sort();
  const acoes = [...new Set(dados.map((d) => d.acao))].sort();
  const lista = useMemo(() => {
    const b = normalizar(busca);
    return dados.filter((d) => (!pessoa || d.email === pessoa) && (!acao || d.acao === acao) && (!b || normalizar(d.resumo).includes(b)));
  }, [dados, busca, pessoa, acao]);

  function pdf() {
    relatorioPdf({
      entidade, titulo: 'Registro de atividades', subtitulo: `Desde ${desde.split('-').reverse().join('/')}${pessoa ? `, por ${pessoa}` : ''}`, paisagem: true,
      secoes: [{ colunas: ['Quando', 'Quem', 'Ação', 'O quê'], linhas: lista.map((d) => [quando(d.em), d.email || '', d.acao, d.resumo]) }],
    });
  }

  return (
    <>
      <Cabecalho titulo="Registro de atividades" descricao="Tudo que foi criado, recebido, estornado ou excluído, com quem fez e quando. Ninguém consegue alterar ou apagar estas linhas.">
        <button type="button" className="btn" onClick={pdf}><Icone nome="pdf" tam={18} />PDF</button>
      </Cabecalho>
      <ErroLeitura erro={erro} />
      <div className="painel">
        <div className="filtros">
          <Campo rotulo="Desde"><input type="date" max={hoje()} value={desde} onChange={(e) => e.target.value && setDesde(e.target.value)} /></Campo>
          <Campo rotulo="Quem">
            <select value={pessoa} onChange={(e) => setPessoa(e.target.value)}><option value="">Todos</option>{pessoas.map((p) => <option key={p}>{p}</option>)}</select>
          </Campo>
          <Campo rotulo="Ação">
            <select value={acao} onChange={(e) => setAcao(e.target.value)}><option value="">Todas</option>{acoes.map((a) => <option key={a}>{a}</option>)}</select>
          </Campo>
          <Campo rotulo="Buscar"><input type="search" placeholder="Nome do sócio, conta, valor…" value={busca} onChange={(e) => setBusca(e.target.value)} /></Campo>
        </div>
        {carregando ? <Carregando /> : !lista.length ? <Vazio titulo="Nenhuma atividade nesse período" /> : (
          <div className="tabela-wrap">
            <table>
              <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>O quê</th></tr></thead>
              <tbody>
                {lista.map((d) => (
                  <tr key={d.id}>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>{quando(d.em)}</td>
                    <td>{d.email}</td>
                    <td><Selo tipo={COR_ACAO[d.acao] || 'neutro'}>{d.acao}</Selo></td>
                    <td>{d.resumo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
