
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getPublicOrganizations } from '../services/organizationService';
import { Organization } from '../types';
import { SparklesIcon, UsersIcon, SearchIcon, MegaphoneIcon, CheckCircleIcon } from '../components/Icons';

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
      return (
        <div className="text-center py-8">
            <p className="text-red-400 bg-red-900/20 p-4 rounded-lg inline-block">{error}</p>
        </div>
      );
    }
    
    if (organizations.length === 0) {
        return <p className="text-gray-400 text-center py-12 bg-secondary/30 rounded-xl">Nenhuma organização encontrada no momento.</p>;
    }
    
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {organizations.map(org => (
            <Link
              key={org.id}
              to={`/${org.id}`}
              className="flex items-center justify-between p-6 bg-gray-800/80 rounded-2xl text-left hover:bg-primary transition-all duration-300 transform hover:scale-[1.02] border border-gray-700 hover:border-transparent group shadow-xl"
            >
              <div>
                <span className="block font-black text-white text-2xl group-hover:text-white transition-colors">{org.name}</span>
                <span className="text-gray-400 text-sm group-hover:text-pink-100">Clique para se cadastrar</span>
              </div>
              <div className="bg-gray-700/50 p-3 rounded-xl group-hover:bg-white/20 transition-colors">
                  <UsersIcon className="w-8 h-8 text-primary group-hover:text-white transition-all" />
              </div>
            </Link>
        ))}
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto space-y-10 py-6 px-4">
      
      {/* Brand Section - Simplified */}
      <div className="text-center space-y-2">
          <div className="inline-block px-4 py-1.5 bg-primary/10 border border-primary/20 rounded-full text-primary text-[10px] font-bold uppercase tracking-widest">
              Plataforma Oficial de Gestão
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tighter">Equipe Certa</h1>
          <p className="text-gray-400 text-sm max-w-lg mx-auto">Portal oficial para divulgadoras e produtores de eventos.</p>
      </div>

      {/* Main Selection Area */}
      <div className="relative">
          <div className="absolute -inset-1 bg-gradient-to-r from-primary to-purple-600 rounded-3xl blur opacity-10"></div>
          <div className="relative bg-secondary/80 backdrop-blur-xl shadow-2xl rounded-3xl p-6 md:p-10 border border-gray-800">
              <div className="flex items-center gap-4 mb-8">
                  <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                  <h2 className="text-2xl font-black text-white uppercase tracking-tighter">
                    Escolha a Produtora
                  </h2>
              </div>
              {renderContent()}
          </div>
      </div>

      {/* Action Buttons */}
      <section className="flex flex-wrap justify-center gap-4">
        <Link to="/como-funciona" className="px-6 py-3 bg-primary text-white font-black rounded-full hover:bg-primary-dark transition-all shadow-lg flex items-center gap-2 transform hover:-translate-y-0.5 text-xs md:text-sm">
          <SparklesIcon className="w-5 h-5" /> GUIA DA DIVULGADORA
        </Link>
        <Link to="/status" className="px-6 py-3 bg-gray-800 text-white font-black rounded-full hover:bg-gray-700 transition-all flex items-center gap-2 border border-gray-700 transform hover:-translate-y-0.5 text-xs md:text-sm">
          <SearchIcon className="w-5 h-5" /> CONSULTAR MEU STATUS
        </Link>
      </section>

      {/* Info Grid - More compact */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 bg-gray-800/40 rounded-3xl border border-gray-800 group hover:border-primary/30 transition-colors">
           <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center text-blue-400 mb-4 group-hover:scale-110 transition-transform">
               <UsersIcon className="w-5 h-5" />
           </div>
           <h3 className="text-white text-lg font-bold mb-2">Cadastro Único</h3>
           <p className="text-gray-500 text-sm leading-relaxed">Perfil inteligente para se candidatar a diversos eventos em um clique.</p>
        </div>
        <div className="p-6 bg-gray-800/40 rounded-3xl border border-gray-800 group hover:border-primary/30 transition-colors">
           <div className="w-10 h-10 bg-pink-500/20 rounded-xl flex items-center justify-center text-pink-400 mb-4 group-hover:scale-110 transition-transform">
               <MegaphoneIcon className="w-5 h-5" />
           </div>
           <h3 className="text-white text-lg font-bold mb-2">Tarefas e Listas</h3>
           <p className="text-gray-500 text-sm leading-relaxed">Acesse artes, envie comprovações e gerencie suas próprias listas VIP.</p>
        </div>
        <div className="p-6 bg-gray-800/40 rounded-3xl border border-gray-800 group hover:border-primary/30 transition-colors">
           <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center text-green-400 mb-4 group-hover:scale-110 transition-transform">
               <CheckCircleIcon className="w-5 h-5" />
           </div>
           <h3 className="text-white text-lg font-bold mb-2">Transparência</h3>
           <p className="text-gray-500 text-sm leading-relaxed">Acompanhe seu desempenho e garanta sua vaga nos melhores eventos.</p>
        </div>
      </div>
    </div>
  );
};

export default PublicHome;
