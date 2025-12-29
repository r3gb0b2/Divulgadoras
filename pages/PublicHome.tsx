
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getPublicOrganizations } from '../services/organizationService';
import { Organization } from '../types';
import { UsersIcon, SearchIcon, SparklesIcon, MegaphoneIcon, CheckCircleIcon, TicketIcon } from '../components/Icons';
import { Capacitor } from '@capacitor/core';

const PublicHome: React.FC = () => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Detecta se é App Nativo
  const isNative = Capacitor.isNativePlatform();
  
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
              className="flex items-center justify-between p-6 bg-gray-800 border-2 border-gray-700 rounded-3xl text-left hover:bg-primary hover:border-transparent transition-all duration-300 transform hover:scale-[1.02] group shadow-xl"
            >
              <div className="overflow-hidden pr-4">
                <span className="block font-extrabold text-white text-xl md:text-2xl uppercase tracking-tight group-hover:text-white transition-colors truncate mb-1">
                  {org.name}
                </span>
                <span className="text-gray-400 font-bold text-xs uppercase tracking-widest group-hover:text-purple-100 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full group-hover:bg-white"></span>
                    VER VAGAS DISPONÍVEIS
                </span>
              </div>
              <div className="bg-gray-700/50 p-3 rounded-2xl group-hover:bg-white/20 transition-colors flex-shrink-0">
                  <MegaphoneIcon className="w-8 h-8 text-primary group-hover:text-white transition-all" />
              </div>
            </Link>
        ))}
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto space-y-10 py-12 px-4">
      
      {/* Hero Section */}
      <section className="text-center space-y-8 animate-fadeIn pt-4">
          <div className="flex justify-center mb-4">
             <div className="p-4 bg-primary/10 rounded-full border border-primary/20">
                <MegaphoneIcon className="w-12 h-12 text-primary" />
             </div>
          </div>

          <div className="flex flex-wrap justify-center gap-4 md:gap-6">
              <Link to="/posts" className="px-8 md:px-10 py-5 bg-primary text-white font-black rounded-3xl shadow-2xl shadow-primary/40 hover:scale-105 active:scale-95 transition-all uppercase tracking-[0.1em] text-sm md:text-lg flex items-center gap-3">
                  <MegaphoneIcon className="w-6 h-6" />
                  POSTAGENS
              </Link>
              
              <Link to="/status" className="px-8 md:px-10 py-5 bg-gray-800 text-white font-black rounded-3xl border border-gray-700 hover:bg-gray-700 hover:border-gray-600 transition-all uppercase tracking-[0.1em] text-sm md:text-lg flex items-center gap-3">
                  <SearchIcon className="w-6 h-6" />
                  MEU STATUS
              </Link>

              <Link to="/promocao-emocoes" className="relative px-8 md:px-10 py-5 bg-gradient-to-br from-indigo-600 to-purple-800 text-white font-black rounded-3xl shadow-2xl hover:scale-105 active:scale-95 transition-all uppercase tracking-[0.1em] text-sm md:text-lg flex items-center gap-3 border border-white/20 overflow-hidden group">
                  <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                  <SparklesIcon className="w-6 h-6 text-yellow-400" />
                  CLUBE VIP
              </Link>
          </div>
      </section>

      {/* Seção de Seleção */}
      {!isNative && (
        <div id="agencias" className="relative pt-10">
            <div className="absolute -inset-4 bg-gradient-to-tr from-primary/20 via-purple-600/10 to-transparent rounded-[40px] blur-3xl opacity-50 -z-10"></div>
            <div className="bg-secondary/40 backdrop-blur-2xl shadow-3xl rounded-[40px] p-6 md:p-10 border border-white/5">
                <div className="flex flex-col items-center gap-6 mb-10 border-b border-white/5 pb-8 text-center">
                    <div className="space-y-2 w-full">
                        <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight">
                            Equipes de <span className="text-primary">Produção</span>
                        </h2>
                        <p className="text-gray-400 font-medium text-sm md:text-base">Escolha uma produtora para realizar seu cadastro oficial.</p>
                    </div>
                </div>
                
                {renderContent()}
            </div>
        </div>
      )}

      {/* Info Rápida */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto py-10 border-y border-white/5">
        <div className="flex gap-4 items-start">
           <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary flex-shrink-0">
               <MegaphoneIcon className="w-6 h-6" />
           </div>
           <div>
               <h3 className="text-white font-black text-xs uppercase tracking-widest">Portal Web</h3>
               <p className="text-gray-500 text-[11px] mt-1 leading-relaxed">Gerencie suas tarefas, baixe artes e envie comprovantes diretamente pelo navegador.</p>
           </div>
        </div>
        <div className="flex gap-4 items-start">
           <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary flex-shrink-0">
               <SearchIcon className="w-6 h-6" />
           </div>
           <div>
               <h3 className="text-white font-black text-xs uppercase tracking-widest">Status Online</h3>
               <p className="text-gray-500 text-[11px] mt-1 leading-relaxed">Acompanhe se suas fotos foram aprovadas e receba o link dos grupos em tempo real.</p>
           </div>
        </div>
        <div className="flex gap-4 items-start">
           <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary flex-shrink-0">
               <CheckCircleIcon className="w-6 h-6" />
           </div>
           <div>
               <h3 className="text-white font-black text-xs uppercase tracking-widest">Check-in Ágil</h3>
               <p className="text-gray-500 text-[11px] mt-1 leading-relaxed">No dia do evento, sua entrada é validada rapidamente através das fotos do seu perfil.</p>
           </div>
        </div>
      </div>

      {/* Rodapé de Ações */}
      <section className="flex flex-col items-center gap-6 pt-10">
        <div className="flex flex-wrap justify-center gap-8">
            <Link to="/como-funciona" className="text-gray-400 hover:text-white font-black text-[10px] uppercase tracking-widest transition-colors underline decoration-primary/50 underline-offset-4">
               GUIA DA DIVULGADORA
            </Link>
            {!isNative && (
                <Link to="/apple-test" className="text-gray-600 hover:text-primary font-black text-[10px] uppercase tracking-widest transition-colors">
                    VERSÃO APP IPHONE (BETA)
                </Link>
            )}
        </div>
        <p className="text-[9px] text-gray-700 uppercase font-black tracking-[0.3em]">
            Equipe Certa • Gestão Profissional de Eventos
        </p>
      </section>
    </div>
  );
};

export default PublicHome;
