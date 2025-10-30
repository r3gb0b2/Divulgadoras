import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UsersIcon, CreditCardIcon, MapPinIcon, ArrowLeftIcon, SparklesIcon, MegaphoneIcon, BuildingOfficeIcon, KeyIcon, ChartBarIcon, ClockIcon, ClipboardDocumentListIcon, TicketIcon } from '../components/Icons';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getOrganization } from '../services/organizationService';
import { Organization } from '../types';

const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { adminData, selectedOrgId } = useAdminAuth();
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    if (selectedOrgId) {
      getOrganization(selectedOrgId).then(orgData => {
        if (orgData && adminData?.uid === orgData.ownerUid) {
          setIsOwner(true);
        } else {
          setIsOwner(false);
        }
      }).catch(err => {
        console.error("Could not fetch organization data for owner check:", err);
        setIsOwner(false);
      });
    } else {
      setIsOwner(false);
    }
  }, [adminData, selectedOrgId]);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Configurações da Organização</h1>
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
          <ArrowLeftIcon className="w-4 h-4" />
          <span>Voltar ao Painel</span>
        </button>
      </div>
      <div className="bg-secondary shadow-lg rounded-lg p-6">
        <p className="text-gray-400 mb-6">
          Gerencie os usuários, regiões, eventos e sua assinatura na plataforma.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {isOwner && (
            <Link
              to={`/admin/organization/${selectedOrgId}`}
              className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300"
            >
              <div className="flex items-center">
                <BuildingOfficeIcon className="w-8 h-8 text-primary" />
                <h2 className="ml-4 text-xl font-semibold text-gray-100">Dados da Organização</h2>
              </div>
              <p className="mt-2 text-gray-400">
                Edite o nome da sua organização, regiões, administradores associados e outras configurações gerais.
              </p>
              <div className="text-sm text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
                Gerenciar &rarr;
              </div>
            </Link>
          )}

           {/* Gerenciar Regiões e Eventos */}
          <Link
            to="/admin/states"
            className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300"
          >
            <div className="flex items-center">
              <MapPinIcon className="w-8 h-8 text-primary" />
              <h2 className="ml-4 text-xl font-semibold text-gray-100">Regiões e Eventos</h2>
            </div>
            <p className="mt-2 text-gray-400">
              Visualize suas regiões ativas e crie ou edite eventos/gêneros para receber cadastros.
            </p>
            <div className="text-sm text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
              Acessar &rarr;
            </div>
          </Link>

          {/* Gerenciar Usuários */}
          <Link
            to="/admin/users"
            className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300"
          >
            <div className="flex items-center">
              <UsersIcon className="w-8 h-8 text-primary" />
              <h2 className="ml-4 text-xl font-semibold text-gray-100">Gerenciar Usuários</h2>
            </div>
            <p className="mt-2 text-gray-400">
              Adicione, edite ou remova membros da sua equipe que podem acessar este painel.
            </p>
            <div className="text-sm text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
              Acessar &rarr;
            </div>
          </Link>

          {/* Gerenciar Posts */}
          <Link
            to="/admin/posts"
            className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300"
          >
            <div className="flex items-center">
              <MegaphoneIcon className="w-8 h-8 text-primary" />
              <h2 className="ml-4 text-xl font-semibold text-gray-100">Gerenciamento de Posts</h2>
            </div>
            <p className="mt-2 text-gray-400">
              Crie publicações de texto ou imagem e designe para suas divulgadoras aprovadas.
            </p>
            <div className="text-sm text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
              Acessar &rarr;
            </div>
          </Link>
          
           {/* Post Único */}
          <Link
            to="/admin/one-time-posts"
            className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300"
          >
            <div className="flex items-center">
              <MegaphoneIcon className="w-8 h-8 text-purple-400" />
              <h2 className="ml-4 text-xl font-semibold text-gray-100">Post Único</h2>
            </div>
            <p className="mt-2 text-gray-400">
              Crie um post com link compartilhável para pessoas não cadastradas enviarem comprovação e entrarem na lista.
            </p>
            <div className="text-sm text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
              Gerenciar &rarr;
            </div>
          </Link>

          {/* Gerenciar Listas de Convidados */}
          <Link
            to="/admin/lists"
            className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300"
          >
            <div className="flex items-center">
              <ClipboardDocumentListIcon className="w-8 h-8 text-primary" />
              <h2 className="ml-4 text-xl font-semibold text-gray-100">Gerenciar Listas de Convidados</h2>
            </div>
            <p className="mt-2 text-gray-400">
              Crie listas (VIP, Aniversariante), atribua divulgadoras e gere links únicos de confirmação.
            </p>
            <div className="text-sm text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
              Acessar &rarr;
            </div>
          </Link>

          {/* Controle de Entrada */}
           <Link
            to="/admin/checkin-dashboard"
            className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300"
          >
            <div className="flex items-center">
              <TicketIcon className="w-8 h-8 text-primary" />
              <h2 className="ml-4 text-xl font-semibold text-gray-100">Controle de Entrada</h2>
            </div>
            <p className="mt-2 text-gray-400">
              Valide a entrada de divulgadoras e convidados no dia do evento através da tela de check-in.
            </p>
            <div className="text-sm text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
              Acessar &rarr;
            </div>
          </Link>
          
           {/* Desempenho das Divulgadoras */}
          <Link
            to="/admin/dashboard"
            className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300"
          >
            <div className="flex items-center">
              <ChartBarIcon className="w-8 h-8 text-primary" />
              <h2 className="ml-4 text-xl font-semibold text-gray-100">Desempenho das Divulgadoras</h2>
            </div>
            <p className="mt-2 text-gray-400">
              Analise estatísticas de postagens, como aproveitamento, posts perdidos e justificativas por divulgadora.
            </p>
            <div className="text-sm text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
              Analisar &rarr;
            </div>
          </Link>
          
          {/* Publicações Agendadas */}
          <Link
            to="/admin/scheduled-posts"
            className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300"
          >
            <div className="flex items-center">
              <ClockIcon className="w-8 h-8 text-primary" />
              <h2 className="ml-4 text-xl font-semibold text-gray-100">Publicações Agendadas</h2>
            </div>
            <p className="mt-2 text-gray-400">
              Crie posts com antecedência e agende o envio automático para a data e hora desejada.
            </p>
            <div className="text-sm text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
              Gerenciar &rarr;
            </div>
          </Link>


           {/* Alterar Senha */}
           <Link
              to="/admin/settings/change-password"
              className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300"
            >
              <div className="flex items-center">
                <KeyIcon className="w-8 h-8 text-primary" />
                <h2 className="ml-4 text-xl font-semibold text-gray-100">Alterar Senha</h2>
              </div>
              <p className="mt-2 text-gray-400">
                Modifique sua senha de acesso ao painel de administrador.
              </p>
              <div className="text-sm text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
                Acessar &rarr;
              </div>
            </Link>

          {/* Gerenciar Assinatura */}
          <Link
            to="/admin/settings/subscription"
            className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300"
          >
            <div className="flex items-center">
              <CreditCardIcon className="w-8 h-8 text-primary" />
              <h2 className="ml-4 text-xl font-semibold text-gray-100">Gerenciar Assinatura</h2>
            </div>
            <p className="mt-2 text-gray-400">
              Visualize seu plano atual, histórico de faturas e gerencie sua forma de pagamento.
            </p>
            <div className="text-sm text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
              Acessar &rarr;
            </div>
          </Link>

          {/* Assistente Gemini */}
          <Link
            to="/admin/gemini"
            className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300"
          >
            <div className="flex items-center">
              <SparklesIcon className="w-8 h-8 text-primary" />
              <h2 className="ml-4 text-xl font-semibold text-gray-100">Assistente Gemini</h2>
            </div>
            <p className="mt-2 text-gray-400">
              Use a inteligência artificial do Google para gerar textos criativos, ideias para redes sociais, regras de eventos e muito mais.
            </p>
            <div className="text-sm text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
              Acessar &rarr;
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;