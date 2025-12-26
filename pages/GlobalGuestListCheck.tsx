
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getGlobalListById } from '../services/globalListService';
import { findPromotersByEmail } from '../services/promoterService';
import { getActiveGuestListsForCampaign, addGuestListConfirmation, getGuestListConfirmationsByEmail } from '../services/guestListService';
import { GlobalList, Promoter, GuestList, GuestListConfirmation, Timestamp } from '../types';
import { ArrowLeftIcon, SearchIcon, CheckCircleIcon, UserIcon, MailIcon, ClipboardDocumentListIcon } from '../components/Icons';

const GlobalGuestListCheck: React.FC = () => {
    const { listId } = useParams<{ listId: string }>();
    const navigate = useNavigate();
    
    const [email, setEmail] = useState('');
    const [globalList, setGlobalList] = useState<GlobalList | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searched, setSearched] = useState(false);

    // Mapeamento de dados identificados
    const [eligibleCampaigns, setEligibleCampaigns] = useState<{
        list: GuestList;
        promoter: Promoter;
        existing?: GuestListConfirmation;
    }[]>([]);

    useEffect(() => {
        if (!listId) return;
        getGlobalListById(listId).then(data => {
            setGlobalList(data);
            setIsLoading(false);
        }).catch(() => {
            setError("Link global inválido.");
            setIsLoading(false);
        });
    }, [listId]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim() || !globalList) return;
        
        setIsSearching(true);
        setError(null);
        setEligibleCampaigns([]);
        
        try {
            const profiles = await findPromotersByEmail(email);
            const userConfirmations = await getGuestListConfirmationsByEmail(email);
            const found: typeof eligibleCampaigns = [];

            for (const item of globalList.items) {
                const approvedProfile = profiles.find(p => 
                    p.status === 'approved' && 
                    p.organizationId === item.organizationId &&
                    (p.campaignName === item.campaignName || p.associatedCampaigns?.includes(item.campaignName))
                );

                if (approvedProfile) {
                    const activeLists = await getActiveGuestListsForCampaign(item.campaignId);
                    if (activeLists.length > 0) {
                        // Pegamos a primeira lista ativa do evento
                        const list = activeLists[0];
                        const existing = userConfirmations.find(c => c.guestListId === list.id);
                        found.push({ list, promoter: approvedProfile, existing });
                    }
                }
            }

            if (found.length === 0) {
                setError("Você não possui cadastros aprovados para os eventos deste link.");
            } else {
                setEligibleCampaigns(found);
                setSearched(true);
            }
        } catch (e) {
            setError("Erro ao verificar acesso.");
        } finally {
            setIsSearching(false);
        }
    };

    if (isLoading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div></div>;

    return (
        <div className="max-w-2xl mx-auto px-4 py-10">
            <button onClick={() => navigate('/')} className="flex items-center gap-2 text-[10px] font-black text-gray-500 uppercase tracking-widest hover:text-white mb-8">
                <ArrowLeftIcon className="w-4 h-4" /> Início
            </button>

            <div className="bg-secondary/40 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 shadow-2xl text-center mb-8">
                <div className="w-16 h-16 bg-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-6 text-primary border border-primary/20">
                    <ClipboardDocumentListIcon className="w-8 h-8" />
                </div>
                <h1 className="text-3xl font-black text-white uppercase tracking-tighter">{globalList?.name}</h1>
                <p className="text-gray-400 text-sm mt-2 font-medium">Preencha suas listas em um só lugar.</p>
                
                {!searched ? (
                    <form onSubmit={handleSearch} className="mt-8 space-y-4">
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Seu e-mail cadastrado" className="w-full px-6 py-5 border border-gray-700 rounded-3xl bg-dark text-white focus:ring-2 focus:ring-primary outline-none font-bold" required />
                        <button type="submit" disabled={isSearching} className="w-full py-5 bg-primary text-white font-black rounded-3xl shadow-xl shadow-primary/20 disabled:opacity-50 uppercase text-xs tracking-widest">
                            {isSearching ? 'VERIFICANDO...' : 'ACESSAR LISTAS'}
                        </button>
                    </form>
                ) : (
                    <button onClick={() => { setSearched(false); setEmail(''); }} className="mt-6 text-primary text-[10px] font-black uppercase tracking-widest hover:underline">Trocar de e-mail</button>
                )}
            </div>

            {error && <p className="text-red-400 text-center font-bold uppercase text-xs tracking-widest bg-red-900/20 p-4 rounded-2xl border border-red-900/50">{error}</p>}

            <div className="space-y-6">
                {eligibleCampaigns.map((item, idx) => (
                    <div key={idx} className="bg-secondary/60 backdrop-blur-lg rounded-[2.5rem] p-8 border border-white/5 shadow-2xl">
                        <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-4">
                            <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center text-green-500">
                                <CheckCircleIcon className="w-6 h-6" />
                            </div>
                            <div className="text-left">
                                <h2 className="text-xl font-black text-white uppercase tracking-tight leading-none">{item.list.campaignName}</h2>
                                <p className="text-[8px] text-primary font-black uppercase tracking-widest mt-1.5">{item.list.name}</p>
                            </div>
                        </div>
                        
                        {/* Aqui poderíamos renderizar o formulário da GuestListCheck.tsx adaptado */}
                        <p className="text-gray-400 text-sm text-left leading-relaxed">
                            Para este evento, você tem direito a <strong>{item.list.guestAllowance} convidados</strong>. 
                        </p>
                        <button 
                            onClick={() => navigate(`/listas/${item.list.campaignId}?email=${encodeURIComponent(email)}`)}
                            className="w-full mt-6 py-4 bg-gray-800 text-white font-black rounded-2xl uppercase text-[10px] tracking-widest hover:bg-gray-700 transition-all"
                        >
                            {item.existing ? 'VER/EDITAR NOMES' : 'PREENCHER AGORA'}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default GlobalGuestListCheck;
