
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
              className="flex items-center justify-between p-8 bg-gray-800 border-2 border-gray-700 rounded-3xl text-left hover:bg-primary hover:border-transparent transition-all duration-300 transform hover:scale-[1.03] group shadow-2xl"
            >
              <div className="overflow-hidden">
                <span className="block font-black text-white text-3xl md:text-4xl uppercase tracking-tighter group-hover:text-white transition-colors truncate mb-1">{org.name}</span>
                <span className="text-gray-400 font-bold text-sm uppercase tracking-widest group-hover:text-pink-100 flex items-center gap-2">
                    <span className="w-2 h-2 bg-primary rounded-full group-hover:bg-white"></span>
                    Cadastrar agora
                </span>
              </div>
              <div className="bg-gray-700/50 p-4 rounded-2xl group-hover:bg-white/20 transition-colors flex-shrink-0">
                  <UsersIcon className="w-10 h-10 text-primary group-hover:text-white transition-all" />
              </div>
            </Link>
        ))}
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto space-y-12 py-10 px-4">
      
      {/* Brand Badge */}
      <div className="text-center">
          <div className="inline-flex items-center gap-2 px-6 py-2 bg-primary/20 border border-primary/30 rounded-full text-primary text-xs font-black uppercase tracking-widest animate-pulse">
              <SparklesIcon className="w-4 h-4" />
              Portal de Seleção Oficial
          </div>
      </div>

      {/* Main Selection Area */}
      <div className="relative">
          <div className="absolute -inset-4 bg-gradient-to-tr from-primary/20 via-purple-600/10 to-transparent rounded-[40px] blur-3xl opacity-50 -z-10"></div>
          <div className="bg-secondary/40 backdrop-blur-2xl shadow-3xl rounded-[40px] p-8 md:p-12 border border-white/5">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 border-b border-white/5 pb-8">
                  <div className="space-y-2">
                    <h2 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tightest">
                        Selecione a <span className="text-primary">Produtora</span>
                    </h2>
                    <p className="text-gray-400 font-medium">Escolha para qual equipe você deseja se candidatar hoje.</p>
                  </div>
                  <div className="flex gap-3">
                     <Link to="/status" className="px-5 py-2.5 bg-gray-800 text-white font-bold rounded-2xl hover:bg-gray-700 transition-all flex items-center gap-2 border border-white/5 text-sm">
                        <SearchIcon className="w-4 h-4" /> MEU STATUS
                    </Link>
                  </div>
              </div>
              
              {renderContent()}
          </div>
      </div>

      {/* Action Footer */}
      <section className="flex flex-wrap justify-center gap-6 pt-4 border-t border-white/5">
        <Link to="/como-funciona" className="text-gray-400 hover:text-white font-black text-xs uppercase tracking-widest flex items-center gap-2 transition-colors">
          <CheckCircleIcon className="w-5 h-5 text-primary" /> GUIA COMPLETO DE USO
        </Link>
      </section>

      {/* Quick Info - Compact */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 opacity-60 hover:opacity-100 transition-opacity">
        <div className="flex gap-4 items-start">
           <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-primary flex-shrink-0">
               <UsersIcon className="w-6 h-6" />
           </div>
           <div>
               <h3 className="text-white font-bold text-sm uppercase">Perfil Único</h3>
               <p className="text-gray-500 text-xs mt-1">Seus dados são salvos para facilitar o acesso em vários eventos.</p>
           </div>
        </div>
        <div className="flex gap-4 items-start">
           <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-primary flex-shrink-0">
               <MegaphoneIcon className="w-6 h-6" />
           </div>
           <div>
               <h3 className="text-white font-bold text-sm uppercase">Portal Exclusivo</h3>
               <p className="text-gray-500 text-xs mt-1">Gerencie suas tarefas, postagens e listas VIP em um só lugar.</p>
           </div>
        </div>
        <div className="flex gap-4 items-start">
           <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-primary flex-shrink-0">
               <CheckCircleIcon className="w-6 h-6" />
           </div>
           <div>
               <h3 className="text-white font-bold text-sm uppercase">Transparência</h3>
               <p className="text-gray-500 text-xs mt-1">Acompanhe seu desempenho e aprovações em tempo real.</p>
           </div>
        </div>
      </div>
    </div>
  );
};

export default PublicHome;
