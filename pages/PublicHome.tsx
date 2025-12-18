
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getPublicOrganizations } from '../services/organizationService';
import { Organization } from '../types';
import { SparklesIcon, UsersIcon, SearchIcon } from '../components/Icons';

const PublicHome: React.FC = () => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const fetchOrgs = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const orgs = await getPublicOrganizations();
        setOrganizations(orgs);
      } catch (err: any) {
        setError("Não foi possível carregar a lista de organizações.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchOrgs();
  }, []);
  
  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex justify-center items-center h-48">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      );
    }

    if (error) {
      return <p className="text-red-400 text-center bg-red-900/20 p-4 rounded-lg">{error}</p>;
    }
    
    if (organizations.length === 0) {
        return <p className="text-gray-400 text-center py-8">Nenhuma organização encontrada no momento.</p>;
    }
    
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {organizations.map(org => (
            <Link
              key={org.id}
              to={`/${org.id}`}
              className="flex items-center justify-between p-6 bg-gray-800 rounded-xl text-left hover:bg-primary transition-all duration-300 transform hover:scale-[1.02] border border-gray-700 hover:border-transparent group shadow-lg"
            >
              <div>
                <span className="block font-bold text-white text-xl group-hover:text-white transition-colors">{org.name}</span>
                <span className="text-gray-400 text-sm group-hover:text-pink-100">Clique para se cadastrar</span>
              </div>
              <UsersIcon className="w-8 h-8 text-primary group-hover:text-white opacity-50 group-hover:opacity-100 transition-all" />
            </Link>
        ))}
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto space-y-12 py-4">
      {/* Hero Section */}
      <section className="text-center space-y-6">
        <h1 className="text-4xl md:text-6xl font-black text-white leading-tight">
          Faça parte da <span className="text-primary italic">Equipe Certa</span>
        </h1>
        <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
          Gerencie seus cadastros, acesse tarefas exclusivas e ganhe benefícios nos melhores eventos da sua região.
        </p>
        
        <div className="flex flex-wrap justify-center gap-4 pt-4">
          <Link to="/como-funciona" className="px-8 py-3 bg-primary text-white font-bold rounded-full hover:bg-primary-dark transition-all shadow-lg shadow-primary/20 flex items-center gap-2">
            <SparklesIcon className="w-5 h-5" /> Ver Guia da Divulgadora
          </Link>
          <Link to="/status" className="px-8 py-3 bg-gray-700 text-white font-bold rounded-full hover:bg-gray-600 transition-all flex items-center gap-2">
            <SearchIcon className="w-5 h-5" /> Consultar meu Status
          </Link>
        </div>
      </section>

      {/* Main Selection Area */}
      <div className="bg-secondary/50 backdrop-blur-sm shadow-2xl rounded-3xl p-8 border border-gray-800">
          <div className="flex items-center gap-3 mb-8">
              <div className="h-8 w-2 bg-primary rounded-full"></div>
              <h2 className="text-2xl font-bold text-gray-100 uppercase tracking-wider">
                Escolha a Produtora do Evento
              </h2>
          </div>
          {renderContent()}
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 bg-gray-800/30 rounded-2xl border border-gray-800">
           <h3 className="text-white font-bold mb-2">Simples e Rápido</h3>
           <p className="text-sm text-gray-500">Cadastre-se uma vez e reutilize seus dados para novos eventos com apenas um clique.</p>
        </div>
        <div className="p-6 bg-gray-800/30 rounded-2xl border border-gray-800">
           <h3 className="text-white font-bold mb-2">Painel Exclusivo</h3>
           <p className="text-sm text-gray-500">Acesse artes, instruções e gerencie suas próprias listas VIP sem sair de casa.</p>
        </div>
        <div className="p-6 bg-gray-800/30 rounded-2xl border border-gray-800">
           <h3 className="text-white font-bold mb-2">Fique no Loop</h3>
           <p className="text-sm text-gray-500">Acompanhe sua aprovação em tempo real e entre nos grupos oficiais pelo nosso portal.</p>
        </div>
      </div>
    </div>
  );
};

export default PublicHome;
