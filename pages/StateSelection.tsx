
import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getOrganization } from '../services/organizationService';
import { states } from '../constants/states';
import { Organization } from '../types';
import { ArrowLeftIcon, MapPinIcon } from '../components/Icons';

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
            <div className="flex justify-center items-center py-40">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }
    
    if (error) {
        return (
            <div className="max-w-2xl mx-auto py-20 px-4 text-center">
                <div className="bg-red-900/20 border border-red-500/50 p-10 rounded-[3rem]">
                    <p className="text-red-400 font-black uppercase tracking-widest">{error}</p>
                    <button onClick={() => navigate('/')} className="mt-8 px-8 py-3 bg-primary text-white font-bold rounded-full">Voltar ao Início</button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto text-center py-8 md:py-16 px-4">
             <button onClick={() => navigate('/')} className="inline-flex items-center gap-2 text-sm font-black text-gray-500 hover:text-white transition-colors mb-10 uppercase tracking-widest">
                <ArrowLeftIcon className="w-5 h-5" />
                <span>Voltar</span>
            </button>

            <div className="bg-secondary/40 backdrop-blur-2xl shadow-3xl rounded-[3rem] p-8 md:p-14 border border-white/5 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary to-purple-600"></div>
                
                <div className="mb-10">
                    <div className="w-16 h-16 bg-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-6 text-primary">
                        <MapPinIcon className="w-8 h-8" />
                    </div>
                    <h1 className="text-4xl md:text-5xl font-black text-white mb-4 uppercase tracking-tighter">
                        {organization?.name || 'Selecione a Região'}
                    </h1>
                    <p className="text-gray-400 font-medium text-lg">
                        Escolha o seu estado para ver as vagas e eventos disponíveis.
                    </p>
                </div>

                {activeStates.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {activeStates.map(state => (
                            <Link
                                key={state.abbr}
                                to={`/${organizationId}/register/${state.abbr}`}
                                className="group block p-6 bg-white/5 rounded-3xl text-center font-black text-gray-100 border border-white/10 hover:bg-primary hover:border-transparent transition-all duration-300 transform hover:scale-[1.03] uppercase tracking-widest text-sm shadow-xl"
                            >
                                {state.name}
                            </Link>
                        ))}
                    </div>
                ) : (
                    <div className="py-10 bg-dark/50 rounded-3xl border border-dashed border-gray-700">
                        <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Nenhuma região ativa para cadastro nesta organização.</p>
                    </div>
                )}

                <div className="mt-14 pt-8 border-t border-white/5 text-center">
                    <p className="text-[10px] text-gray-600 font-black uppercase tracking-[0.3em]">Passo 1 de 2 • Seleção de Região</p>
                </div>
            </div>
        </div>
    );
};

export default StateSelection;
