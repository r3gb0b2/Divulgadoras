import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getOrganizations } from '../services/organizationService';
import { Organization } from '../types';

interface PublicHomeProps {
  promptForOrg?: boolean;
}

const PublicHome: React.FC<PublicHomeProps> = ({ promptForOrg }) => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchOrgs = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const orgs = await getOrganizations();
        setOrganizations(orgs);
      } catch (err: any) {
        setError("Não foi possível carregar a lista de organizações.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchOrgs();
  }, []);
  
  const handleStatusCheckRedirect = (orgId: string) => {
    navigate(`/${orgId}/status`);
  }

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
    
    const title = promptForOrg
      ? "Para qual organização você deseja verificar seu status?"
      : "Selecione a organização do seu evento";

    return (
      <>
        <h2 className="text-2xl font-bold text-gray-100 mb-6">{title}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {organizations.map(org => (
            promptForOrg ? (
              <button
                key={org.id}
                onClick={() => handleStatusCheckRedirect(org.id)}
                className="block p-4 bg-gray-700 rounded-lg text-center font-semibold text-gray-200 hover:bg-primary hover:text-white transition-all duration-300 transform hover:scale-105"
              >
                {org.name}
              </button>
            ) : (
              <Link
                key={org.id}
                to={`/${org.id}`}
                className="block p-4 bg-gray-700 rounded-lg text-center font-semibold text-gray-200 hover:bg-primary hover:text-white transition-all duration-300 transform hover:scale-105"
              >
                {org.name}
              </Link>
            )
          ))}
        </div>
      </>
    );
  };

  return (
    <div className="max-w-4xl mx-auto text-center">
      <div className="bg-secondary shadow-2xl rounded-lg p-8">
        {!promptForOrg && (
            <>
                <h1 className="text-3xl font-bold text-gray-100 mb-2">
                  Bem-vindo(a) à Plataforma de Divulgadoras
                </h1>
                <p className="text-gray-400 mb-8">
                  Encontre a produtora do seu evento abaixo para iniciar o cadastro ou verificar seu status.
                </p>
            </>
        )}
        {renderContent()}
      </div>
    </div>
  );
};

export default PublicHome;
