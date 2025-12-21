
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
    <div className="max-w-5xl mx-auto space-y-12 py-8 px-4">
      
      {/* Header Badge */}
      <div className="text-center pt-4">
          <div className="inline-block px-4 py-1.5 bg-primary/10 border border-primary/20 rounded-full text-primary text-xs font-bold uppercase tracking-widest">
              Plataforma Oficial de Cadastro
          </div>
      </div>

      {/* Main Selection Area - Now at the Top */}
      <div className="relative">
          <div className="absolute -inset-1 bg-gradient-to-r from-primary to-purple-600 rounded-3xl blur opacity-10"></div>
          <div className="relative bg-secondary/80 backdrop-blur-xl shadow-2xl rounded-3xl p-8 md:p-12 border border-gray-800">
              <div className="flex items-center gap-4 mb-10">
                  <div className="h-10 w-2 bg-primary rounded-full"></div>
                  <h2 className="text-3xl font-black text-white uppercase tracking-tighter">
                    Escolha a Produtora
                  </h2>
              </div>
              {renderContent()}
          </div>
      </div>

      {/* Action Buttons - Repositioned Below the Producer Cards */}
      <section className="flex flex-wrap justify-center gap-4 md:gap-6">
        <Link to="/como-funciona" className="px-8 py-4 bg-primary text-white font-black rounded-full hover:bg-primary-dark transition-all shadow-xl shadow-primary/20 flex items-center gap-3 transform hover:-translate-y-1 text-sm md:text-base">
          <SparklesIcon className="w-6 h-6" /> VER GUIA DA DIVULGADORA
        </Link>
        <Link to="/status" className="px-8 py-4 bg-gray-800 text-white font-black rounded-full hover:bg-gray-700 transition-all flex items-center gap-3 border border-gray-700 transform hover:-translate-y-1 text-sm md:text-base">
          <SearchIcon className="w-6 h-6" /> CONSULTAR MEU STATUS
        </Link>
      </section>

      {/* Info Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-10">
        <div className="p-8 bg-gray-800/40 rounded-3xl border border-gray-800 group hover:border-primary/30 transition-colors">
           <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center text-blue-400 mb-6 group-hover:scale-110 transition-transform">
               <UsersIcon className="w-6 h-6" />
           </div>
           <h3 className="text-white text-xl font-bold mb-3">Cadastro Único</h3>
           <p className="text-gray-500 leading-relaxed">Preencha seus dados uma vez e utilize seu perfil para se candidatar a diversos eventos com apenas um clique.</p>
        </div>
        <div className="p-8 bg-gray-800/40 rounded-3xl border border-gray-800 group hover:border-primary/30 transition-colors">
           <div className="w-12 h-12 bg-pink-500/20 rounded-2xl flex items-center justify-center text-pink-400 mb-6 group-hover:scale-110 transition-transform">
               <MegaphoneIcon className="w-6 h-6" />
           </div>
           <h3 className="text-white text-xl font-bold mb-3">Tarefas e Listas</h3>
           <p className="text-gray-500 leading-relaxed">Acesse artes exclusivas para postar, envie seus prints de comprovação e gerencie suas próprias listas VIP no portal.</p>
        </div>
        <div className="p-8 bg-gray-800/40 rounded-3xl border border-gray-800 group hover:border-primary/30 transition-colors">
           <div className="w-12 h-12 bg-green-500/20 rounded-2xl flex items-center justify-center text-green-400 mb-6 group-hover:scale-110 transition-transform">
               <CheckCircleIcon className="w-6 h-6" />
           </div>
           <h3 className="text-white text-xl font-bold mb-3">Tudo Transparente</h3>
           <p className="text-gray-500 leading-relaxed">Acompanhe sua taxa de aproveitamento e garanta sua vaga nos melhores eventos mantendo um bom desempenho.</p>
        </div>
      </div>
    </div>
  );
};

export default PublicHome;
