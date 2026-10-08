import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { configurado } from './lib/firebase';
import { Carregando } from './components/ui';
import Layout from './components/Layout';
import Login from './pages/Login';
import Instalacao from './pages/Instalacao';
import SemConfiguracao from './pages/SemConfiguracao';
import SemAcesso from './pages/SemAcesso';
import Painel from './pages/Painel';
import Socios from './pages/Socios';
import Mensalidades from './pages/Mensalidades';
import Contas from './pages/Contas';
import Caixa from './pages/Caixa';
import Eventos from './pages/Eventos';
import Invernadas from './pages/Invernadas';
import Patrimonio from './pages/Patrimonio';
import Relatorios from './pages/Relatorios';
import Usuarios from './pages/Usuarios';
import Configuracoes from './pages/Configuracoes';
import Entidades from './pages/Entidades';
import Portal from './pages/Portal';

function Protegida({ modulo, children }) {
  const { pode, superadmin } = useAuth();
  const ok = modulo === 'superadmin' ? superadmin : pode(modulo);
  return ok ? children : <Navigate to="/" replace />;
}

export default function App() {
  const { user, perfil, papel, sistemaOk, carregando } = useAuth();

  if (!configurado) return <SemConfiguracao />;
  if (carregando) return <Carregando texto="Abrindo o galpão…" />;
  if (!sistemaOk && !perfil) return <Instalacao />;
  if (!user) return <Login />;
  if (!perfil || !papel) return <SemAcesso />;
  if (papel === 'socio') return <Portal />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Painel />} />
        <Route path="socios" element={<Protegida modulo="socios"><Socios /></Protegida>} />
        <Route path="mensalidades" element={<Protegida modulo="mensalidades"><Mensalidades /></Protegida>} />
        <Route path="contas" element={<Protegida modulo="contas"><Contas /></Protegida>} />
        <Route path="caixa" element={<Protegida modulo="caixa"><Caixa /></Protegida>} />
        <Route path="relatorios" element={<Protegida modulo="caixa"><Relatorios /></Protegida>} />
        <Route path="eventos" element={<Protegida modulo="eventos"><Eventos /></Protegida>} />
        <Route path="invernadas" element={<Protegida modulo="invernadas"><Invernadas /></Protegida>} />
        <Route path="patrimonio" element={<Protegida modulo="patrimonio"><Patrimonio /></Protegida>} />
        <Route path="usuarios" element={<Protegida modulo="usuarios"><Usuarios /></Protegida>} />
        <Route path="configuracoes" element={<Protegida modulo="configuracoes"><Configuracoes /></Protegida>} />
        <Route path="entidades" element={<Protegida modulo="superadmin"><Entidades /></Protegida>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
