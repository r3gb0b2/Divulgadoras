import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getStatesConfig } from '../services/settingsService';
import { getOrganization } from '../services/organizationService';
import { states } from '../constants/states';
import { Organization } from '../types';

const StateSelection: React.FC = () => {
    const { organizationId } = useParams<{ organizationId: string }>();
    const [activeStates, setActiveStates] = useState<{ abbr: string; name: string }[]>([]);
    const [organization, setOrganization] = useState<Organization | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!organizationId) {
            setError("Organização não especificada.");
            setIsLoading(false);
            return;
        }

        const fetchInitialData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const [config, orgData] = await Promise.all([
                    getStatesConfig(),
                    getOrganization(organizationId)
                ]);

                if (!orgData) {
                    throw new Error("Organização não encontrada.");
                }
                setOrganization(orgData);
                
                const available = states
                    .filter(state => config[state.abbr]?.isActive ?? true)
                    .sort((a, b) => a.name.localeCompare(b.name));
                
                setActiveStates(available);

            } catch (err: any) {
                setError(err.message || 'Não foi possível carregar as localidades.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchInitialData();
    }, [organizationId]);

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

    return (
        <div className="max-w-4xl mx-auto text-center">
            <div className="bg-secondary shadow-2xl rounded-lg p-8">
                <h1 className="text-3xl font-bold text-gray-100 mb-2">
                    {organization?.name || 'Selecione a Localidade'}
                </h1>
                <p className="text-gray-400 mb-8">
                    Escolha o estado onde você deseja se cadastrar como divulgadora.
                </p>
                {activeStates.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {activeStates.map(state => (
                            <Link
                                key={state.abbr}
                                to={`/${organizationId}/register/${state.abbr}`}
                                className="block p-4 bg-gray-700 rounded-lg text-center font-semibold text-gray-200 hover:bg-primary hover:text-white transition-all duration-300 transform hover:scale-105"
                            >
                                {state.name}
                            </Link>
                        ))}
                    </div>
                ) : (
                    <p className="text-gray-400">Nenhuma localidade ativa para cadastro no momento.</p>
                )}
            </div>
        </div>
    );
};

export default StateSelection;
