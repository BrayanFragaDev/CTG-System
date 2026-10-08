const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const fmtMoeda = (v) => moeda.format(Number(v) || 0);

export function fmtData(iso) {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function fmtCompetencia(comp) {
  if (!comp) return '—';
  const [a, m] = comp.split('-');
  return `${MESES[Number(m) - 1]}/${a}`;
}
export function fmtCompetenciaCurta(comp) {
  if (!comp) return '—';
  const [a, m] = comp.split('-');
  return `${MESES_CURTOS[Number(m) - 1]}/${a.slice(2)}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

export function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function competenciaAtual() { return hoje().slice(0, 7); }

export function somarMeses(comp, n) {
  const [a, m] = comp.split('-').map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function ultimoDiaMes(comp) {
  const [a, m] = comp.split('-').map(Number);
  return `${comp}-${pad(new Date(a, m, 0).getDate())}`;
}

export function idade(nasc) {
  if (!nasc) return null;
  const n = new Date(nasc + 'T12:00:00');
  const h = new Date();
  let i = h.getFullYear() - n.getFullYear();
  if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) i--;
  return i;
}

export function diasEntre(a, b) {
  return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
}

export function arred(v) { return Math.round((Number(v) || 0) * 100) / 100; }

export function somar(lista, campo = 'valor') {
  return arred(lista.reduce((s, x) => s + (Number(x[campo]) || 0), 0));
}

export function normalizar(t) {
  return (t || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function mascaraCpf(v) {
  return (v || '').replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}
export function mascaraTelefone(v) {
  const d = (v || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}

export function valorPorExtenso(valor) {
  const un = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const dz = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const ct = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  const ate999 = (n) => {
    if (n === 0) return '';
    if (n === 100) return 'cem';
    const c = Math.floor(n / 100), r = n % 100;
    const partes = [];
    if (c) partes.push(ct[c]);
    if (r < 20) { if (r) partes.push(un[r]); }
    else { partes.push(dz[Math.floor(r / 10)] + (r % 10 ? ' e ' + un[r % 10] : '')); }
    return partes.join(' e ');
  };
  const inteiro = Math.floor(valor);
  const cent = Math.round((valor - inteiro) * 100);
  const mil = Math.floor(inteiro / 1000), resto = inteiro % 1000;
  let txt = '';
  if (mil) txt = (mil === 1 ? 'mil' : ate999(mil) + ' mil');
  if (resto) txt += (txt ? (resto < 100 || resto % 100 === 0 ? ' e ' : ' ') : '') + ate999(resto);
  if (inteiro) txt += inteiro === 1 ? ' real' : ' reais';
  if (cent) txt += (txt ? ' e ' : '') + ate999(cent) + (cent === 1 ? ' centavo' : ' centavos');
  return txt || 'zero reais';
}
