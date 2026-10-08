import { Marca } from '../components/Icone';

// Moldura das telas de login e instalação: campo e coxilha à esquerda, formulário à direita
export default function TelaEntrada({ titulo, texto, children }) {
  return (
    <div className="entrada-tela">
      <section className="entrada-arte">
        <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
          <Marca tam={44} />
          <strong style={{ fontFamily: 'var(--serif)', fontSize: '1.35rem', color: '#fff' }}>Galpão</strong>
        </div>
        <div>
          <h1>{titulo}</h1>
          <p style={{ marginTop: '1rem' }}>{texto}</p>
        </div>
        <svg className="coxilha" viewBox="0 0 560 140" aria-hidden="true">
          <path d="M0 110 C 80 70, 160 70, 240 95 S 400 130, 560 80 L560 140 L0 140Z" fill="#2B4D3D" />
          <path d="M0 125 C 120 100, 220 105, 330 120 S 480 128, 560 110 L560 140 L0 140Z" fill="#355C49" />
          <g transform="translate(380 52)" fill="none" stroke="#D9A621" strokeWidth="3" strokeLinejoin="round">
            <path d="M0 30 L28 6 L56 30" />
            <path d="M8 30 V48 H48 V30" stroke="#E4EBE4" />
            <path d="M24 48 V36 H32 V48" stroke="#E4EBE4" />
          </g>
          <circle cx="120" cy="34" r="16" fill="#C8951A" opacity=".85" />
        </svg>
      </section>
      <section className="entrada-form">{children}</section>
    </div>
  );
}
