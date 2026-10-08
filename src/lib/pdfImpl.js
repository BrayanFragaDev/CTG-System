import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fmtData, fmtMoeda, hoje, valorPorExtenso, fmtCompetencia } from './format';

const VERDE = [31, 58, 46];
const COURO = [122, 82, 48];

function nomeArquivo(t) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

function cabecalho(doc, entidade, titulo, subtitulo) {
  const L = doc.internal.pageSize.getWidth();
  doc.setFillColor(...VERDE);
  doc.rect(0, 0, L, 22, 'F');
  doc.setDrawColor(...COURO);
  doc.setLineWidth(1.2);
  doc.line(0, 22.6, L, 22.6);
  doc.setTextColor(255, 255, 255);
  doc.setFont('times', 'bold');
  doc.setFontSize(14);
  doc.text(entidade?.nome || 'Entidade', 12, 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const linha2 = [entidade?.cnpj && `CNPJ ${entidade.cnpj}`, entidade?.cidade, entidade?.rt && `${entidade.rt}ª Região Tradicionalista`].filter(Boolean).join('   ');
  if (linha2) doc.text(linha2, 12, 16);
  doc.setTextColor(30, 30, 30);
  doc.setFont('times', 'bold');
  doc.setFontSize(15);
  doc.text(titulo, 12, 33);
  if (subtitulo) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(90, 90, 90);
    doc.text(subtitulo, 12, 39);
  }
  return subtitulo ? 44 : 38;
}

function rodapes(doc) {
  const n = doc.getNumberOfPages();
  const L = doc.internal.pageSize.getWidth();
  const A = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Emitido em ${fmtData(hoje())}`, 12, A - 7);
    doc.text(`Página ${i} de ${n}`, L - 12, A - 7, { align: 'right' });
  }
}

const estiloTabela = {
  theme: 'grid',
  styles: { fontSize: 9, cellPadding: 2.2, lineColor: [215, 220, 214], lineWidth: 0.2 },
  headStyles: { fillColor: [238, 241, 236], textColor: [40, 50, 45], fontStyle: 'bold' },
  footStyles: { fillColor: [238, 241, 236], textColor: [20, 20, 20], fontStyle: 'bold' },
  margin: { left: 12, right: 12, bottom: 14 },
};

// Relatório tabular genérico. secoes: [{ titulo?, colunas, linhas, rodape?, alinharDireita?: [idx] }]
export function relatorioPdf({ entidade, titulo, subtitulo, secoes, paisagem = false, resumo }) {
  const doc = new jsPDF({ orientation: paisagem ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  let y = cabecalho(doc, entidade, titulo, subtitulo);
  if (resumo?.length) {
    doc.setFontSize(10);
    resumo.forEach(([rot, val]) => {
      doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80); doc.text(rot, 12, y + 2);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20); doc.text(String(val), 80, y + 2);
      y += 6;
    });
    y += 2;
  }
  secoes.forEach((s) => {
    if (s.titulo) {
      if (y > doc.internal.pageSize.getHeight() - 30) { doc.addPage(); y = 16; }
      doc.setFont('times', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...COURO);
      doc.text(s.titulo, 12, y + 3);
      y += 6;
    }
    const colStyles = {};
    (s.alinharDireita || []).forEach((i) => { colStyles[i] = { halign: 'right' }; });
    autoTable(doc, {
      ...estiloTabela, startY: y, head: [s.colunas], body: s.linhas,
      foot: s.rodape ? [s.rodape.map((c, i) => ((s.alinharDireita || []).includes(i) ? { content: c, styles: { halign: 'right' } } : c))] : undefined,
      columnStyles: colStyles, showFoot: 'lastPage',
    });
    y = doc.lastAutoTable.finalY + 8;
  });
  rodapes(doc);
  doc.save(`${nomeArquivo(titulo)}.pdf`);
}

// Recibo de pagamento (mensalidades ou qualquer recebimento)
export function reciboPdf({ entidade, numero, pagador, valor, referente, itens, data, forma, recebidoPor }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'landscape' });
  const L = doc.internal.pageSize.getWidth();
  let y = cabecalho(doc, entidade, 'Recibo', numero ? `Nº ${numero}` : undefined);
  doc.setFont('times', 'bold'); doc.setFontSize(16); doc.setTextColor(...VERDE);
  doc.text(fmtMoeda(valor), L - 12, 33, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(30, 30, 30);
  const texto = `Recebemos de ${pagador} a importância de ${fmtMoeda(valor)} (${valorPorExtenso(valor)}), referente a ${referente}.`;
  const linhas = doc.splitTextToSize(texto, L - 24);
  doc.text(linhas, 12, y + 4);
  y += 4 + linhas.length * 5.5;
  if (itens?.length) {
    autoTable(doc, { ...estiloTabela, startY: y, head: [['Referência', 'Valor']], body: itens.map((i) => [i.descricao, fmtMoeda(i.valor)]), columnStyles: { 1: { halign: 'right' } }, styles: { ...estiloTabela.styles, fontSize: 8.5 } });
    y = doc.lastAutoTable.finalY + 6;
  }
  doc.setFontSize(9.5); doc.setTextColor(80, 80, 80);
  doc.text(`Forma de pagamento: ${forma || '—'}`, 12, y + 2);
  doc.text(`${entidade?.cidade ? entidade.cidade + ', ' : ''}${fmtData(data)}`, 12, y + 8);
  const A = doc.internal.pageSize.getHeight();
  doc.setDrawColor(120, 120, 120); doc.setLineWidth(0.3);
  doc.line(L - 90, A - 22, L - 12, A - 22);
  doc.setFontSize(9);
  doc.text(recebidoPor || 'Tesouraria', L - 51, A - 17, { align: 'center' });
  doc.save(`recibo-${nomeArquivo(pagador)}-${data}.pdf`);
}

export function reciboMensalidades(entidade, socio, mensalidades, recebidoPor) {
  const total = mensalidades.reduce((s, m) => s + (Number(m.valorPago ?? m.valor) || 0), 0);
  const ref = mensalidades.length === 1
    ? `mensalidade de ${fmtCompetencia(mensalidades[0].competencia)}`
    : `${mensalidades.length} mensalidades`;
  const ultima = mensalidades.map((m) => m.dataPagamento).sort().pop();
  reciboPdf({
    entidade,
    numero: mensalidades.length === 1 ? mensalidades[0].id.slice(0, 8).toUpperCase() : undefined,
    pagador: `${socio?.nome || mensalidades[0].socioNome}${socio?.matricula ? ` (matrícula ${socio.matricula})` : ''}`,
    valor: total,
    referente: ref,
    itens: mensalidades.length > 1 ? mensalidades.map((m) => ({ descricao: `Mensalidade ${fmtCompetencia(m.competencia)}`, valor: m.valorPago ?? m.valor })) : null,
    data: ultima || hoje(),
    forma: [...new Set(mensalidades.map((m) => m.formaPagamento).filter(Boolean))].join(', '),
    recebidoPor,
  });
}

export function fichaSocioPdf(entidade, s, dependentes = []) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = cabecalho(doc, entidade, 'Ficha de sócio', `Matrícula ${s.matricula || '—'}`);
  const pares = [
    ['Nome', s.nome], ['CPF', s.cpf], ['RG', s.rg], ['Nascimento', fmtData(s.nascimento)], ['Sexo', s.sexo],
    ['Telefone', s.telefone], ['E-mail', s.email],
    ['Endereço', [s.endereco, s.bairro, s.cidade, s.cep].filter(Boolean).join(', ')],
    ['Categoria', s.categoria], ['Situação', s.situacao], ['Admissão', fmtData(s.dataAdmissao)],
    ['Cartão tradicionalista (MTG)', s.carteiraMtg], ['Observações', s.observacoes],
  ];
  autoTable(doc, { ...estiloTabela, startY: y, body: pares.map(([a, b]) => [a, b || '—']), columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55, fillColor: [247, 249, 246] } } });
  y = doc.lastAutoTable.finalY + 8;
  if (dependentes.length) {
    doc.setFont('times', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...COURO);
    doc.text('Dependentes', 12, y); y += 3;
    autoTable(doc, { ...estiloTabela, startY: y, head: [['Nome', 'Nascimento', 'Categoria']], body: dependentes.map((d) => [d.nome, fmtData(d.nascimento), d.categoria]) });
  }
  rodapes(doc);
  doc.save(`ficha-${nomeArquivo(s.nome)}.pdf`);
}
