
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getPublicOrganizations } from '../services/organizationService';
import { Organization } from '../types';
import { SparklesIcon, UsersIcon, SearchIcon, MegaphoneIcon, CheckCircleIcon, ArrowLeftIcon } from '../components/Icons';

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
        setError("Não foi possível carregar as produtoras.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchOrgs();
  }, []);
  
  return (
    <div className="max-w-6xl mx-auto space-y-16 py-10 px-4">
      
      {/* Hero Section */}
      <section className="text-center space-y-6 py-12 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/20 rounded-full blur-3xl -z-10 animate-pulse"></div>
        <div className="inline-block px-4 py-1.5 bg-primary/10 border border-primary/20 rounded-full text-primary text-xs font-black uppercase tracking-widest mb-4">
          Recrutamento Aberto 2024
        </div>
        <h1 className="text-5xl md:text-7xl font-black text-white leading-tight tracking-tighter">
          SEJA UMA <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-400">DIVULGADORA</span> DE ELITE
        </h1>
        <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto font-medium">
          Trabalhe com as maiores produtoras de eventos, ganhe acessos VIP e construa sua carreira na noite.
        </p>
        <div className="flex flex-wrap justify-center gap-4 pt-4">
          <a href="#produtoras" className="px-10 py-4 bg-primary text-white font-black rounded-full hover:bg-primary-dark transition-all shadow-2xl shadow-primary/40 flex items-center gap-2 transform hover:-translate-y-1">
            QUERO ME CADASTRAR
          </a>
          <Link to="/status" className="px-10 py-4 bg-gray-800 text-white font-black rounded-full hover:bg-gray-700 transition-all border border-gray-700 flex items-center gap-2 transform hover:-translate-y-1">
            VER MEU STATUS
          </Link>
        </div>
      </section>

      {/* Benefits Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="p-8 bg-secondary/50 rounded-3xl border border-gray-800 hover:border-primary/30 transition-all group">
           <div className="w-14 h-14 bg-blue-500/20 rounded-2xl flex items-center justify-center text-blue-400 mb-6 group-hover:scale-110 transition-transform">
               <UsersIcon className="w-8 h-8" />
           </div>
           <h3 className="text-white text-2xl font-bold mb-3">Perfil Único</h3>
           <p className="text-gray-500 leading-relaxed font-medium">Cadastre-se uma vez e use seu perfil para se candidatar a dezenas de eventos e produtoras diferentes.</p>
        </div>
        <div className="p-8 bg-secondary/50 rounded-3xl border border-gray-800 hover:border-primary/30 transition-all group">
           <div className="w-14 h-14 bg-pink-500/20 rounded-2xl flex items-center justify-center text-pink-400 mb-6 group-hover:scale-110 transition-transform">
               <MegaphoneIcon className="w-8 h-8" />
           </div>
           <h3 className="text-white text-2xl font-bold mb-3">Gestão de Posts</h3>
           <p className="text-gray-500 leading-relaxed font-medium">Receba as artes e legendas prontas no seu painel. Envie seus prints de comprovação e suba no ranking.</p>
        </div>
        <div className="p-8 bg-secondary/50 rounded-3xl border border-gray-800 hover:border-primary/30 transition-all group">
           <div className="w-14 h-14 bg-green-500/20 rounded-2xl flex items-center justify-center text-green-400 mb-6 group-hover:scale-110 transition-transform">
               <CheckCircleIcon className="w-8 h-8" />
           </div>
           <h3 className="text-white text-2xl font-bold mb-3">Listas VIP</h3>
           <p className="text-gray-500 leading-relaxed font-medium">Gerencie seus convidados diretamente pelo App. Exportação automática para o check-in do evento.</p>
        </div>
      </section>

      {/* Main Selection Area */}
      <div id="produtoras" className="relative scroll-mt-24">
          <div className="absolute -inset-1 bg-gradient-to-r from-primary to-purple-600 rounded-3xl blur opacity-15"></div>
          <div className="relative bg-secondary shadow-2xl rounded-3xl p-8 md:p-12 border border-gray-800">
              <div className="flex items-center gap-4 mb-10">
                  <div className="h-10 w-2 bg-primary rounded-full"></div>
                  <h2 className="text-4xl font-black text-white uppercase tracking-tighter">
                    Escolha a Produtora
                  </h2>
              </div>
              
              {isLoading ? (
                <div className="flex justify-center py-20">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                </div>
              ) : organizations.length === 0 ? (
                <div className="text-center py-10 text-gray-500 font-medium">Nenhuma produtora com cadastros abertos no momento.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {organizations.map(org => (
                      <Link
                        key={org.id}
                        to={`/${org.id}`}
                        className="flex items-center justify-between p-8 bg-gray-800/40 rounded-2xl hover:bg-primary transition-all duration-300 group border border-gray-700 hover:border-transparent"
                      >
                        <div>
                          <span className="block font-black text-white text-3xl group-hover:text-white transition-colors">{org.name}</span>
                          <span className="text-gray-500 text-sm group-hover:text-white/80 font-bold mt-1 block">CLIQUE PARA SE INSCREVER</span>
                        </div>
                        <div className="bg-gray-700/50 p-4 rounded-2xl group-hover:bg-white/20 transition-colors">
                            <ArrowLeftIcon className="w-6 h-6 text-primary group-hover:text-white rotate-180" />
                        </div>
                      </Link>
                  ))}
                </div>
              )}
          </div>
      </div>

      <footer className="text-center pt-10 border-t border-gray-800 text-gray-500 text-sm font-medium">
          <p>© {new Date().getFullYear()} Equipe Certa • A ferramenta definitiva do produtor de eventos.</p>
      </footer>
    </div>
  );
};

export default PublicHome;
