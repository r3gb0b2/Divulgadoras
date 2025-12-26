import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getOrganization } from '../services/organizationService';
import { states } from '../constants/states';
import { Organization } from '../types';
import { ArrowLeftIcon } from '../components/Icons';

const StateSelection: React.FC = () => {
    const { organizationId } = useParams<{ organizationId: string }>();
    const [activeStates, setActiveStates] = useState<{ abbr: string; name: string }[]>([]);
    const [organization, setOrganization] = useState<Organization | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

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
                const orgData = await getOrganization(organizationId);

                if (!orgData) {
                    throw new Error("Organização não encontrada.");
                }

                if (orgData.status === 'deactivated') {
                    throw new Error("Esta organização está desativada e não pode receber novos cadastros. O link está desativado.");
                }

                setOrganization(orgData);

                // If org has assigned states, use them. Otherwise, show all.
                const statesToDisplay = orgData.assignedStates && orgData.assignedStates.length > 0
                    ? states.filter(s => orgData.assignedStates.includes(s.abbr))
                    : states; // Fallback to all states if none are assigned
                
                const available = statesToDisplay.sort((a, b) => a.name.localeCompare(b.name));
                
                setActiveStates(available);

            } catch (err: any) {
                setError(err.message || 'Não foi possível carregar as regiões.');
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
        return <p className="text-red-400 text-center bg-red-900/50 p-4 rounded-md">{error}</p>;
    }

    return (
        <div className="max-w-4xl mx-auto text-center">
             <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4">
                <ArrowLeftIcon className="w-5 h-5" />
                <span>Voltar</span>
            </button>
            <div className="bg-secondary shadow-2xl rounded-lg p-8">
                <h1 className="text-3xl font-bold text-gray-100 mb-2">
                    {organization?.name || 'Selecione a Região'}
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
                    <p className="text-gray-400">Nenhuma região ativa para cadastro nesta organização no momento.</p>
                )}
            </div>
        </div>
    );
};

export default StateSelection;