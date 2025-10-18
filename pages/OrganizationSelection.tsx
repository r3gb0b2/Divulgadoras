import React, { useState, useEffect } from 'react';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getOrganizations } from '../services/organizationService';
import { Organization } from '../types';
import { BuildingOfficeIcon } from '../components/Icons';
import { auth } from '../firebase/config';

const OrganizationSelection: React.FC = () => {
  const { adminData, selectOrganization, user } = useAdminAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchOrgs = async () => {
      if (!adminData?.organizationIds || adminData.organizationIds.length === 0) {
        setError('Nenhuma organização atribuída à sua conta. Entre em contato com o suporte.');
        setIsLoading(false);
        return;
      }
      try {
        const allOrgs = await getOrganizations();
        const myOrgs = allOrgs.filter(org => adminData.organizationIds.includes(org.id))
                              .sort((a,b) => a.name.localeCompare(b.name));
        setOrganizations(myOrgs);
      } catch (err) {
        setError('Falha ao carregar suas organizações. Tente recarregar a página.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchOrgs();
  }, [adminData]);

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

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {organizations.map(org => (
          <button
            key={org.id}
            onClick={() => selectOrganization(org.id)}
            className="group block p-6 bg-gray-700 rounded-lg text-center hover:bg-primary transition-all duration-300 transform hover:scale-105"
          >
            <BuildingOfficeIcon className="w-10 h-10 mx-auto text-gray-400 group-hover:text-white" />
            <span className="mt-3 block font-semibold text-lg text-gray-200 group-hover:text-white">{org.name}</span>
          </button>
        ))}
      </div>
    );
  };
  
  return (
    <div className="max-w-4xl mx-auto">
        <div className="bg-secondary shadow-2xl rounded-lg p-8">
            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-gray-100 mb-2">
                    Selecione uma Organização
                </h1>
                <p className="text-gray-400">
                    Olá, {user?.displayName || user?.email}! Escolha qual organização você deseja gerenciar.
                </p>
            </div>
            
            {renderContent()}

            <div className="text-center mt-8">
                <button
                    onClick={() => auth.signOut()}
                    className="text-sm text-gray-500 hover:text-primary"
                >
                    Sair da conta
                </button>
            </div>
        </div>
    </div>
  );
};

export default OrganizationSelection;
