import React from 'react';
import { Link } from 'react-router-dom';
import { UsersIcon, CreditCardIcon } from '../components/Icons';

const SettingsPage: React.FC = () => {
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Configurações da Organização</h1>
        <Link to="/admin" className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
          &larr; Voltar ao Painel
        </Link>
      </div>
      <div className="bg-secondary shadow-lg rounded-lg p-6">
        <p className="text-gray-400 mb-6">
          Gerencie os usuários da sua equipe e sua assinatura na plataforma.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
