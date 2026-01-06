
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getGreenlifeMembershipsByEmail, getAllGreenlifeEvents } from '../services/greenlifeService';
import { VipMembership } from '../types';
import { ArrowLeftIcon, SearchIcon, CheckCircleIcon, TicketIcon, DownloadIcon, RefreshIcon } from '../components/Icons';
import GreenlifeTicket from '../components/GreenlifeTicket';

const GreenlifeStatus: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [email, setEmail] = useState('');
    const [memberships, setMemberships] = useState<VipMembership[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showTicketFor, setShowTicketFor] = useState<VipMembership | null>(null);

    const performSearch = useCallback(async (searchEmail: string) => {
        const targetEmail = searchEmail?.toLowerCase().trim();
        if (!targetEmail) return;

        setIsLoading(true);
        setError(null);
        setSearched(true);
        try {
            // Busca apenas as adesões do e-mail específico (muito mais eficiente)
            const userMemb = await getGreenlifeMembershipsByEmail(targetEmail);
            const confirmedMemb = userMemb.filter(m => m.status === 'confirmed');
            
            if (confirmedMemb.length === 0) {
                setError("Nenhuma adesão ativa encontrada para este e-mail.");
                setMemberships([]);
            } else {
                const allEvents = await getAllGreenlifeEvents();
                // Enriquecer a adesão com os dados atuais de horário e local do evento
                const enrichedMemb = confirmedMemb.map(m => {
                    const event = allEvents.find(e => e.id === m.vipEventId);
                    return {
                        ...m,
                        eventTime: event?.eventTime || m.eventTime,
                        eventLocation: event?.eventLocation || m.eventLocation
                    };
                });
                setMemberships(enrichedMemb);
                localStorage.setItem('saved_promoter_email', targetEmail);
            }
        } catch (err: any) { 
            console.error("Erro técnico na busca Greenlife:", err);
            if (err.message?.includes("index")) {
                setError("O banco de dados está sendo configurado. Tente novamente em alguns minutos.");
            } else if (err.message?.includes("permission")) {
                setError("Erro de permissão ao acessar os dados. Contate o suporte.");
            } else {
                setError("Falha ao sincronizar dados. Verifique sua conexão.");
            }
        } finally { 
            setIsLoading(false); 
        }
    }, []);

    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const emailFromQuery = queryParams.get('email');
        const savedEmail = localStorage.getItem('saved_promoter_email');
        
        if (emailFromQuery) { 
            setEmail(emailFromQuery); 
            performSearch(emailFromQuery); 
        } else if (savedEmail) { 
            setEmail(savedEmail); 
            performSearch(savedEmail); 
        }
    }, [location.search, performSearch]);

    return (
        <div className="max-w-xl mx-auto py-10 px-4">
            <button onClick={() => navigate('/alunosgreenlife')} className="flex items-center gap-2 text-[10px] font-black text-gray-500 uppercase tracking-widest hover:text-white mb-8">
                <ArrowLeftIcon className="w-4 h-4" /> Voltar ao Greenlife
            </button>

            {!searched || isLoading ? (
                <div className="bg-secondary/40 backdrop-blur-xl p-10 rounded-[3rem] border border-white/5 text-center shadow-2xl">
                    <div className="w-16 h-16 bg-green-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6 text-green-500 border border-green-500/20"><SearchIcon className="w-8 h-8" /></div>
                    <h1 className="text-3xl font-black text-white mb-2 uppercase tracking-tighter">MEUS <span className="text-green-500">BENEFÍCIOS</span></h1>
                    <p className="text-gray-400 text-sm mb-8 font-medium">Informe seu e-mail de adesão.</p>
                    <form onSubmit={(e) => { e.preventDefault(); performSearch(email); }} className="space-y-4">
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className="w-full px-6 py-5 border border-gray-700 rounded-[1.5rem] bg-dark text-white focus:ring-2 focus:ring-green-500 outline-none text-center font-black" required />
                        <button type="submit" disabled={isLoading} className="w-full py-5 bg-green-600 text-white font-black rounded-[1.5rem] uppercase text-xs tracking-widest">{isLoading ? 'BUSCANDO...' : 'CONSULTAR AGORA'}</button>
                    </form>
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="text-center">
                        <h1 className="text-3xl font-black text-white uppercase tracking-tighter">MEUS ACESSOS</h1>
                        <p className="text-[10px] text-gray-500 font-mono mt-2 bg-gray-800 px-3 py-1 rounded-full uppercase">{email}</p>
                    </div>

                    {error && (
                        <div className="bg-red-900/20 border border-red-500/50 p-6 rounded-3xl text-center">
                            <p className="text-white font-bold text-sm mb-4">{error}</p>
                            <button 
                                onClick={() => performSearch(email)} 
                                className="px-6 py-2 bg-red-600 text-white text-[10px] font-black uppercase rounded-xl hover:bg-red-500 transition-all"
                            >
                                Tentar Novamente
                            </button>
                        </div>
                    )}

                    {memberships.map(m => (
                        <div key={m.id} className="bg-secondary/60 p-8 rounded-[2.5rem] border border-white/5 shadow-2xl">
                            <h2 className="text-xl font-black text-white uppercase tracking-tight mb-4">{m.vipEventName}</h2>
                            <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-2xl mb-6 text-center">
                                <p className="text-green-500 font-black uppercase text-xs">ACESSO ATIVO ✅</p>
                                <p className="text-[11px] text-green-600 font-black mt-1">CÓDIGO: {m.benefitCode}</p>
                            </div>
                            <button onClick={() => setShowTicketFor(m)} className="w-full py-4 bg-gray-800 text-white font-black rounded-2xl uppercase text-[10px] tracking-widest hover:bg-gray-700 flex items-center justify-center gap-2">
                                <TicketIcon className="w-4 h-4" /> VER INGRESSO DIGITAL
                            </button>
                        </div>
                    ))}
                    <button onClick={() => {setSearched(false); setEmail(''); setError(null);}} className="w-full py-4 text-gray-500 text-xs font-black uppercase hover:text-white">Trocar conta</button>
                </div>
            )}

            {showTicketFor && <GreenlifeTicket membership={showTicketFor} onClose={() => setShowTicketFor(null)} />}
        </div>
    );
};

export default GreenlifeStatus;
