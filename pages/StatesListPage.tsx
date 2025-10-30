

import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getStatesConfig } from '../services/settingsService';
import { getOrganization } from '../services/organizationService';
import { states as allStatesList } from '../constants/states';
import { StatesConfig, Organization } from '../types';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { ArrowLeftIcon } from '../components/Icons';

const StatesListPage: React.FC = () => {
  const { adminData } = useAdminAuth();
  const [statesConfig, setStatesConfig] = useState<StatesConfig>({});
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  
  const isSuperAdmin = adminData?.role === 'superadmin';

  useEffect(() => {
    const fetchConfig = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // FIX: Property 'organizationId' does not exist on type 'AdminUserData'. Did you mean 'organizationIds'?
        if (!isSuperAdmin && adminData?.organizationIds?.[0]) {
          // FIX: Property 'organizationId' does not exist on type 'AdminUserData'. Did you mean 'organizationIds'?
          const orgData = await getOrganization(adminData.organizationIds[0]);
          setOrganization(orgData);
        }
        // Superadmin needs this to show global status (active/inactive)
        const config = await getStatesConfig();
        setStatesConfig(config);
      } catch (err: any) {
        setError(err.message || "Não foi possível carregar as regiões.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchConfig();
  }, [adminData, isSuperAdmin]);
  
  const statesToDisplay = useMemo(() => {
    const sortedList = [...allStatesList].sort((a,b) => a.name.localeCompare(b.name));
    if (isSuperAdmin) {
      return sortedList;
    }
    if (organization?.assignedStates && organization.assignedStates.length > 0) {
      return sortedList.filter(s => organization.assignedStates.includes(s.abbr));
    }
    return [];
  }, [isSuperAdmin, organization]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex justify-center items-center py-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      );
    }

    if (error) {
      return <p className="text-red-400 text-center">{error}</p>;
    }
    
    if (statesToDisplay.length === 0) {
        return (
            <p className="text-gray-400 text-center">
                {isSuperAdmin 
                    ? "Nenhuma região encontrada." 
                    : "Sua organização ainda não possui regiões atribuídas. Peça a um Super Admin para adicioná-las."
                }
            </p>
        );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {statesToDisplay.map(state => {
          const config = statesConfig[state.abbr];
          // For regular admins, always consider the state active if it's assigned to them. The superadmin controls the global toggle.
          const isActive = isSuperAdmin ? (config?.isActive ?? true) : true;

          return (
            <Link
              key={state.abbr}
              to={`/admin/state/${state.abbr}`}
              className="group block p-4 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300"
            >
              <div className="flex justify-between items-center">
                <div className="font-semibold text-gray-100">{state.name} ({state.abbr})</div>
                {isSuperAdmin && (
                   <span className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${isActive ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
                    {isActive ? 'ATIVO' : 'INATIVO'}
                   </span>
                )}
              </div>
              <div className="text-sm text-primary mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                Gerenciar &rarr;
              </div>
            </Link>
          );
        })}
      </div>
    );
  };

  const pageTitle = isSuperAdmin ? "Gerenciar Regiões (Global)" : "Minhas Regiões";
  const pageDescription = isSuperAdmin 
    ? "Selecione uma região para gerenciar eventos de todas as organizações e editar as configurações globais de inscrição."
    : "Selecione uma região para gerenciar suas divulgadoras e criar seus eventos/gêneros.";

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">{pageTitle}</h1>
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
            <ArrowLeftIcon className="w-4 h-4" />
            <span>Voltar</span>
        </button>
      </div>
      <div className="bg-secondary shadow-lg rounded-lg p-6">
        <p className="text-gray-400 mb-6">
            {pageDescription}
        </p>
        {renderContent()}
      </div>
    </div>
  );
};

export default StatesListPage;