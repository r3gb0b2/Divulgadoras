
import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getStatesConfig } from '../services/settingsService';
import { getOrganization } from '../services/organizationService';
import { states as allStatesList } from '../constants/states';
import { StatesConfig, Organization } from '../types';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { ArrowLeftIcon } from '../components/Icons';

const StatesListPage: React.FC = () => {
  const { adminData, selectedOrgId } = useAdminAuth();
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
        if (!isSuperAdmin && selectedOrgId) {
          const orgData = await getOrganization(selectedOrgId);
          setOrganization(orgData);
        }
        const config = await getStatesConfig();
        setStatesConfig(config);
      } catch (err: any) {
        setError(err.message || "Não foi possível carregar as regiões.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchConfig();
  }, [adminData, isSuperAdmin, selectedOrgId]);
  
  const statesToDisplay = useMemo(() => {
    const sortedList = [...allStatesList].sort((a,b) => a.name.localeCompare(b.name));
    if (isSuperAdmin) {
      return sortedList;
    }
    if (organization?.assignedStates && organization.assignedStates.length > 0) {
      return sortedList.filter(s => organization.assignedStates.includes(s.abbr));
    }
    return sortedList; // Fallback: mostra todos se não houver restrição
  }, [isSuperAdmin, organization]);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Regiões e Eventos</h1>
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-gray-400 rounded-xl hover:text-white transition-all text-sm font-bold">
            <ArrowLeftIcon className="w-4 h-4" />
            <span>Voltar</span>
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : error ? (
        <div className="bg-red-900/20 p-6 rounded-2xl border border-red-500/50 text-center">
            <p className="text-red-400 font-bold">{error}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {statesToDisplay.map(state => {
            const config = statesConfig[state.abbr];
            const isActive = isSuperAdmin ? (config?.isActive ?? true) : true;

            return (
              <Link
                key={state.abbr}
                to={`/admin/state/${state.abbr}`}
                className="group relative p-6 bg-secondary/60 backdrop-blur border border-white/5 rounded-[2rem] hover:bg-primary transition-all duration-300 shadow-xl overflow-hidden"
              >
                <div className="absolute -top-4 -right-4 text-6xl font-black text-white/5 group-hover:text-white/10 transition-colors uppercase">{state.abbr}</div>
                <div className="relative z-10 flex justify-between items-center">
                  <div>
                    <div className="font-black text-xl text-white uppercase tracking-tight group-hover:text-white">{state.name}</div>
                    <div className="text-[10px] text-primary group-hover:text-white mt-4 font-black uppercase tracking-widest">Gerenciar Eventos &rarr;</div>
                  </div>
                  {isSuperAdmin && (
                     <span className={`px-2 py-0.5 text-[9px] font-black rounded-full uppercase tracking-widest border ${isActive ? 'bg-green-900/40 text-green-400 border-green-800' : 'bg-red-900/40 text-red-400 border-red-800'}`}>
                        {isActive ? 'ATIVO' : 'INATIVO'}
                     </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StatesListPage;
