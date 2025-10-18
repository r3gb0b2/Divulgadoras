import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UsersIcon, CreditCardIcon, MapPinIcon, ArrowLeftIcon, SparklesIcon, MegaphoneIcon, BuildingOfficeIcon } from '../components/Icons';
import { useAdminAuth } from '../contexts/AdminAuthContext';

const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { adminData, selectedOrganizationId } = useAdminAuth();

  // An admin or superadmin can manage the organization's core data.
  const canManageOrganization = adminData?.role === 'admin' || adminData?.role === 'superadmin';

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
          Gerencie os usuários, localidades, eventos e sua assinatura na plataforma.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {canManageOrganization && (
            <Link
              to={`/admin/organization/${selectedOrganizationId}`}
              className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300"
            >
              <div className="flex items-center">
                <BuildingOfficeIcon className="w-8 h-8 text-primary" />
                <h2 className="ml-4 text-xl font-semibold text-gray-100">Dados da Organização</h2>
              </div>
              <p className="mt-2 text-gray-400">
                Edite o nome da sua organização, localidades, administradores associados e outras configurações gerais.
              </p>
              <div className="text-sm text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
                Gerenciar &rarr;
              </div>
            </Link>
          )}

           {/* Gerenciar Localidades e Eventos */}
          <Link
            to="/admin/states"
            className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300"
          >
            <div className="flex items-center">
              <MapPinIcon className="w-8 h-8 text-primary" />
              <h2 className="ml-4 text-xl font-semibold text-gray-100">Localidades e Eventos</h2>
            </div>
            <p className="mt-2 text-gray-400">
              Visualize suas localidades ativas e crie ou edite eventos/gêneros para receber cadastros.
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