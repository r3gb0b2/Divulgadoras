
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getAllGreenlifeMemberships, getAllGreenlifeEvents } from '../services/greenlifeService';
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
        if (!searchEmail) return;
        setIsLoading(true);
        setError(null);
        setSearched(true);
        try {
            const [allMemb, allEvents] = await Promise.all([
                getAllGreenlifeMemberships(),
                getAllGreenlifeEvents()
            ]);
            const userMemb = allMemb.filter(m => m.promoterEmail === searchEmail.toLowerCase().trim() && m.status === 'confirmed');
            if (userMemb.length === 0) {
                setError("Nenhuma adesão ativa encontrada.");
            } else {
                setMemberships(userMemb);
            }
        } catch (err) { setError("Erro na busca."); } finally { setIsLoading(false); }
    }, []);

    useEffect(() => {
        const savedEmail = localStorage.getItem('saved_promoter_email');
        if (savedEmail) { setEmail(savedEmail); performSearch(savedEmail); }
    }, [performSearch]);

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

                    {error && <p className="bg-red-900/20 border border-red-500/50 p-6 rounded-3xl text-center text-white font-bold">{error}</p>}

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
                    <button onClick={() => {setSearched(false); setEmail('');}} className="w-full py-4 text-gray-500 text-xs font-black uppercase hover:text-white">Trocar conta</button>
                </div>
            )}

            {showTicketFor && <GreenlifeTicket membership={showTicketFor} onClose={() => setShowTicketFor(null)} />}
        </div>
    );
};

export default GreenlifeStatus;
