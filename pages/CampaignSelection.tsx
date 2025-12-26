
import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getOrganization } from '../services/organizationService';
import { getCampaigns } from '../services/settingsService';
import { Campaign, Organization } from '../types';
import { ArrowLeftIcon, MegaphoneIcon } from '../components/Icons';
import { stateMap } from '../constants/states';

const CampaignSelection: React.FC = () => {
    const { organizationId, state } = useParams<{ organizationId: string, state: string }>();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [organization, setOrganization] = useState<Organization | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    useEffect(() => {
        if (!organizationId || !state) return;

        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [orgData, campaignsData] = await Promise.all([
                    getOrganization(organizationId),
                    getCampaigns(state, organizationId)
                ]);

                if (!orgData) throw new Error("Organização não encontrada.");
                setOrganization(orgData);
                
                // Apenas campanhas ativas
                setCampaigns(campaignsData.filter(c => c.status === 'active'));
            } catch (err: any) {
                setError(err.message || 'Erro ao carregar eventos.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [organizationId, state]);

    if (isLoading) {
        return <div className="flex justify-center items-center py-40"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;
    }

    if (error || campaigns.length === 0) {
        return (
            <div className="max-w-2xl mx-auto py-20 px-4 text-center">
                <div className="bg-secondary/40 border border-white/10 p-10 rounded-[3rem]">
                    <h1 className="text-3xl font-black text-white uppercase mb-4">Sem eventos disponíveis</h1>
                    <p className="text-gray-400">Não encontramos eventos ativos para {stateMap[state || ''] || state} nesta produtora.</p>
                    <button onClick={() => navigate(-1)} className="mt-8 px-8 py-3 bg-primary text-white font-bold rounded-full">Voltar</button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto text-center py-8 md:py-16 px-4">
             <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-black text-gray-500 hover:text-white transition-colors mb-10 uppercase tracking-widest">
                <ArrowLeftIcon className="w-5 h-5" />
                <span>Voltar</span>
            </button>

            <div className="bg-secondary/40 backdrop-blur-2xl shadow-3xl rounded-[3rem] p-8 md:p-14 border border-white/5 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary to-purple-600"></div>
                
                <div className="mb-10">
                    <div className="w-16 h-16 bg-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-6 text-primary">
                        <MegaphoneIcon className="w-8 h-8" />
                    </div>
                    <h1 className="text-4xl md:text-5xl font-black text-white mb-4 uppercase tracking-tighter">
                        {organization?.name}
                    </h1>
                    <p className="text-gray-400 font-medium text-lg">
                        Selecione o <span className="text-white">Evento</span> em {stateMap[state || ''] || state}:
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {campaigns.map(campaign => (
                        <Link
                            key={campaign.id}
                            to={`/${organizationId}/${state}/${encodeURIComponent(campaign.name)}/register`}
                            className="group block p-8 bg-white/5 rounded-3xl text-left border border-white/10 hover:bg-primary hover:border-transparent transition-all duration-300 transform hover:scale-[1.02] shadow-xl"
                        >
                            <span className="block font-black text-white text-xl uppercase tracking-tight mb-2">
                                {campaign.name}
                            </span>
                            <span className="text-primary group-hover:text-white text-[10px] font-black uppercase tracking-widest">
                                Iniciar Inscrição &rarr;
                            </span>
                        </Link>
                    ))}
                </div>

                <div className="mt-14 pt-8 border-t border-white/5 text-center">
                    <p className="text-[10px] text-gray-600 font-black uppercase tracking-[0.3em]">Passo 2 de 3 • Seleção de Evento</p>
                </div>
            </div>
        </div>
    );
};

export default CampaignSelection;
