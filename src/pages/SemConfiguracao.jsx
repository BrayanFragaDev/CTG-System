import TelaEntrada from './TelaEntrada';

export default function SemConfiguracao() {
  return (
    <TelaEntrada titulo="Falta ligar o Firebase." texto="O sistema está pronto, mas ainda não sabe em qual projeto do Firebase guardar os dados.">
      <h2>Configuração pendente</h2>
      <p>Crie o arquivo <code>.env</code> na pasta do projeto com as chaves do seu app Web do Firebase (há um modelo em <code>.env.example</code>) e rode o sistema de novo.</p>
      <p>O passo a passo completo está no arquivo <code>README.md</code>.</p>
    </TelaEntrada>
  );
}
