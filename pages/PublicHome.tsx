
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getPublicOrganizations } from '../services/organizationService';
import { Organization } from '../types';
import { UsersIcon, SearchIcon, SparklesIcon, MegaphoneIcon, CheckCircleIcon } from '../components/Icons';
import { Capacitor } from '@capacitor/core';

const PublicHome: React.FC = () => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Detecta se é App Nativo
  const isNative = Capacitor.isNativePlatform();
  
  useEffect(() => {
    // Só buscamos organizações se NÃO for nativo, para economizar recursos no App
    if (isNative) {
        setIsLoading(false);
        return;
    }

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
  }, [isNative]);
  
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
                    CADASTRAR NESTA EQUIPE
                </span>
              </div>
              <div className="bg-gray-700/50 p-3 rounded-2xl group-hover:bg-white/20 transition-colors flex-shrink-0">
                  <UsersIcon className="w-8 h-8 text-primary group-hover:text-white transition-all" />
              </div>
            </Link>
        ))}
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto space-y-10 py-8 px-4">
      
      {/* Hero Section */}
      <section className="text-center space-y-6 animate-fadeIn">
          <div className="inline-flex items-center gap-2 px-6 py-2 bg-green-500/10 border border-green-500/30 rounded-full text-green-400 text-[10px] font-black uppercase tracking-widest">
              <CheckCircleIcon className="w-3 h-3" />
              {isNative ? 'Portal da Divulgadora Equipe Certa' : 'Sistema de Cadastro Web Oficial (Online)'}
          </div>
          
          <h1 className="text-5xl md:text-7xl font-black text-white uppercase tracking-tighter leading-none">
            {isNative ? 'BEM-VINDA AO' : 'SEJA UMA'} <br/><span className="text-primary">{isNative ? 'APP EQUIPE' : 'DIVULGADORA'}</span>
          </h1>
          
          <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto font-medium">
            {isNative 
              ? 'Acompanhe seu status, pegue suas tarefas e gerencie suas listas VIP diretamente do seu celular.' 
              : 'O primeiro passo para entrar nas melhores equipes de eventos. Faça sua inscrição agora, de forma rápida e 100% segura.'
            }
          </p>

          <div className="flex flex-wrap justify-center gap-4 pt-4">
              {/* SÓ MOSTRA CADASTRO SE NÃO FOR APP NATIVO */}
              {!isNative && (
                <a href="#agencias" className="px-10 py-4 bg-primary text-white font-black rounded-2xl shadow-2xl shadow-primary/30 hover:scale-105 active:scale-95 transition-all uppercase tracking-widest text-sm">
                    QUERO ME CADASTRAR
                </a>
              )}
              
              <Link to="/status" className={`px-10 py-4 font-black rounded-2xl transition-all uppercase tracking-widest text-sm ${isNative ? 'bg-primary text-white shadow-2xl shadow-primary/30' : 'bg-gray-800 text-white border border-gray-700 hover:bg-gray-700'}`}>
                  VER MEU STATUS
              </Link>
              
              {isNative && (
                 <Link to="/posts" className="px-10 py-4 bg-gray-800 text-white font-black rounded-2xl border border-gray-700 hover:bg-gray-700 transition-all uppercase tracking-widest text-sm">
                    MINHAS TAREFAS
                </Link>
              )}
          </div>
      </section>

      {/* Seção de Seleção - OCULTA NO APP */}
      {!isNative && (
        <div id="agencias" className="relative pt-10">
            <div className="absolute -inset-4 bg-gradient-to-tr from-primary/20 via-purple-600/10 to-transparent rounded-[40px] blur-3xl opacity-50 -z-10"></div>
            <div className="bg-secondary/40 backdrop-blur-2xl shadow-3xl rounded-[40px] p-6 md:p-10 border border-white/5">
                <div className="flex flex-col items-center gap-6 mb-10 border-b border-white/5 pb-8 text-center">
                    <div className="space-y-2 w-full">
                        <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight">
                            Selecione a <span className="text-primary">Produtora</span>
                        </h2>
                        <p className="text-gray-400 font-medium text-sm md:text-base">Escolha para qual equipe você deseja enviar suas fotos e dados.</p>
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
               <h3 className="text-white font-black text-xs uppercase tracking-widest">Avisos Push</h3>
               <p className="text-gray-500 text-[11px] mt-1 leading-relaxed">No App, você recebe alertas de "Hora de Postar" diretamente na tela do seu celular.</p>
           </div>
        </div>
        <div className="flex gap-4 items-start">
           <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary flex-shrink-0">
               <SearchIcon className="w-6 h-6" />
           </div>
           <div>
               <h3 className="text-white font-black text-xs uppercase tracking-widest">Portal Exclusivo</h3>
               <p className="text-gray-500 text-[11px] mt-1 leading-relaxed">Gerencie suas tarefas e comprovantes sem precisar de links externos ou grupos lotados.</p>
           </div>
        </div>
        <div className="flex gap-4 items-start">
           <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary flex-shrink-0">
               <SparklesIcon className="w-6 h-6" />
           </div>
           <div>
               <h3 className="text-white font-black text-xs uppercase tracking-widest">Check-in Ágil</h3>
               <p className="text-gray-500 text-[11px] mt-1 leading-relaxed">No dia do evento, sua entrada é validada em segundos através do sistema integrado do App.</p>
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
