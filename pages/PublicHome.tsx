import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getPublicOrganizations } from '../services/organizationService';
import { Organization } from '../types';

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
      return <p className="text-red-400 text-center">{error}</p>;
    }
    
    if (organizations.length === 0) {
        return <p className="text-gray-400 text-center">Nenhuma organização encontrada.</p>;
    }
    
    return (
      <>
        <h2 className="text-2xl font-bold text-gray-100 mb-6">Selecione a organização do seu evento</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {organizations.map(org => (
              <Link
                key={org.id}
                to={`/${org.id}`}
                className="block p-4 bg-gray-700 rounded-lg text-center font-semibold text-gray-200 hover:bg-primary hover:text-white transition-all duration-300 transform hover:scale-105"
              >
                {org.name}
              </Link>
          ))}
        </div>
      </>
    );
  };

  return (
    <div className="max-w-4xl mx-auto text-center">
      <div className="bg-secondary shadow-2xl rounded-lg p-8">
            <>
                <h1 className="text-3xl font-bold text-gray-100 mb-2">
                  Bem-vindo(a) à Plataforma de Divulgadoras
                </h1>
                <p className="text-gray-400 mb-8">
                  Encontre a produtora do seu evento abaixo para iniciar o cadastro ou clique em "Verificar Status" no menu.
                </p>
            </>
        {renderContent()}
      </div>
    </div>
  );
};

export default PublicHome;