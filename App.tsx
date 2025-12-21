
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import PublicHome from './pages/PublicHome';
import StatusCheck from './pages/StatusCheck';
import PostCheck from './pages/PostCheck';
import ProofUploadPage from './pages/ProofUploadPage';
import OneTimePostPage from './pages/OneTimePostPage';
import AppleTestRegistration from './pages/AppleTestRegistration';
import AdminAuth from './pages/AdminAuth';
import FollowLoopPage from './pages/FollowLoopPage';
import HowToUsePage from './pages/HowToUsePage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import SupportPage from './pages/SupportPage';
import RegisterF1 from './pages/RegisterF1';
import StateSelection from './pages/StateSelection';
import RegistrationFlowPage from './pages/RegistrationForm';
import ErrorBoundary from './components/ErrorBoundary';
import { AdminAuthProvider } from './contexts/AdminAuthContext';

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AdminAuthProvider>
        <Routes>
          <Route path="/" element={<PublicHome />} />
          <Route path="/status" element={<StatusCheck />} />
          <Route path="/posts" element={<PostCheck />} />
          <Route path="/proof/:assignmentId" element={<ProofUploadPage />} />
          <Route path="/post-unico/:postId" element={<OneTimePostPage />} />
          <Route path="/apple-test" element={<AppleTestRegistration />} />
          <Route path="/admin/*" element={<AdminAuth />} />
          <Route path="/connect/:loopId" element={<FollowLoopPage />} />
          <Route path="/como-funciona" element={<HowToUsePage />} />
          <Route path="/politica-de-privacidade" element={<PrivacyPolicyPage />} />
          <Route path="/suporte" element={<SupportPage />} />
          <Route path="/registrar-f1" element={<RegisterF1 />} />
          
          {/* Rotas de Organização e Campanha */}
          <Route path="/:organizationId" element={<StateSelection />} />
          <Route path="/:organizationId/register/:state" element={<RegistrationFlowPage />} />
          <Route path="/:organizationId/register/:state/:campaignName" element={<RegistrationFlowPage />} />

          {/* Redirecionamento para Home em caso de rota não encontrada */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AdminAuthProvider>
    </ErrorBoundary>
  );
};

export default App;
