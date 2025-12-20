
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getPublicOrganizations } from '../services/organizationService';
import { Organization } from '../types';
import { LogoIcon, SparklesIcon, UsersIcon } from '../components/Icons';

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
        setError("Não foi possível carregar a lista de eventos.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchOrgs();
  }, []);
  
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <LogoIcon className="h-20 w-auto mx-auto text-primary mb-6" />
        <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-4">
          Plataforma de Divulgadoras
        </h1>
        <p className="text-xl text-gray-400">
          Encontre seu evento favorito e cadastre-se para fazer parte da equipe de divulgação!
        </p>
      </div>

      <div className="bg-secondary shadow-2xl rounded-2xl p-8 border border-gray-700">
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : error ? (
          <p className="text-red-400 text-center py-10">{error}</p>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-gray-100 mb-8 flex items-center gap-3">
              <SparklesIcon className="w-7 h-7 text-primary" />
              Eventos com Cadastros Abertos
            </h2>
            
            {organizations.length === 0 ? (
              <div className="text-center py-10 text-gray-500">
                <p>Nenhum evento com cadastro público no momento.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {organizations.map(org => (
                    <Link
                      key={org.id}
                      to={`/${org.id}`}
                      className="group p-6 bg-gray-800 border border-gray-700 rounded-xl hover:border-primary transition-all duration-300 shadow-lg"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-gray-700 rounded-lg text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                          <UsersIcon className="w-6 h-6" />
                        </div>
                        <div className="text-left">
                          <span className="block text-xl font-bold text-white group-hover:text-primary transition-colors">
                            {org.name}
                          </span>
                          <span className="text-sm text-gray-500">Clique para se cadastrar</span>
                        </div>
                      </div>
                    </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link to="/status" className="p-6 bg-gray-800/50 rounded-xl border border-gray-700 text-center hover:bg-gray-800 transition-colors">
          <h3 className="text-lg font-bold text-white mb-2">Já fez seu cadastro?</h3>
          <p className="text-sm text-gray-400">Consulte seu status de aprovação em tempo real.</p>
          <span className="text-primary text-sm font-bold mt-3 inline-block">Verificar Status &rarr;</span>
        </Link>
        <Link to="/como-funciona" className="p-6 bg-gray-800/50 rounded-xl border border-gray-700 text-center hover:bg-gray-800 transition-colors">
          <h3 className="text-lg font-bold text-white mb-2">Dúvidas?</h3>
          <p className="text-sm text-gray-400">Aprenda como funciona a dinâmica da nossa equipe.</p>
          <span className="text-primary text-sm font-bold mt-3 inline-block">Guia Completo &rarr;</span>
        </Link>
      </div>
    </div>
  );
};

export default PublicHome;
