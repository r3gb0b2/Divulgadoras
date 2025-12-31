
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getAllVipMemberships, getActiveVipEvents } from '../services/vipService';
import { findPromotersByEmail } from '../services/promoterService';
import { VipMembership, VipEvent, Promoter } from '../types';
import { ArrowLeftIcon, SearchIcon, SparklesIcon, CheckCircleIcon, ClockIcon, DocumentDuplicateIcon, ExternalLinkIcon, LogoutIcon } from '../components/Icons';

const ClubVipStatus: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [email, setEmail] = useState('');
    const [memberships, setMemberships] = useState<VipMembership[]>([]);
    const [vipEventsMap, setVipEventsMap] = useState<Record<string, VipEvent>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const performSearch = useCallback(async (searchEmail: string) => {
        if (!searchEmail) return;
        setIsLoading(true);
        setError(null);
        setSearched(true);
        try {
            const trimmed = searchEmail.toLowerCase().trim();
            const [allMemb, allEvents] = await Promise.all([
                getAllVipMemberships(),
                getActiveVipEvents()
            ]);

            const userMemb = allMemb.filter(m => m.promoterEmail === trimmed && m.status === 'confirmed');
            
            if (userMemb.length === 0) {
                const profiles = await findPromotersByEmail(trimmed);
                if (profiles.length === 0) {
                    setError("E-mail não encontrado na base VIP.");
                } else {
                    setError("Nenhuma adesão confirmada encontrada para este e-mail.");
                }
                setMemberships([]);
            } else {
                setMemberships(userMemb);
                localStorage.setItem('saved_promoter_email', trimmed);
            }

            const eventMap = allEvents.reduce((acc, ev) => ({ ...acc, [ev.id]: ev }), {} as Record<string, VipEvent>);
            setVipEventsMap(eventMap);

        } catch (err: any) {
            setError("Erro ao sincronizar dados. Tente novamente.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const emailFromQuery = queryParams.get('email');
        const savedEmail = localStorage.getItem('saved_promoter_email');
        if (emailFromQuery) { setEmail(emailFromQuery); performSearch(emailFromQuery); }
        else if (savedEmail) { setEmail(savedEmail); performSearch(savedEmail); }
    }, [location.search, performSearch]);

    const handleLogout = () => {
        localStorage.removeItem('saved_promoter_email');
        setMemberships([]);
        setSearched(false);
        setEmail('');
    };

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        alert("Código copiado!");
    };

    return (
        <div className="max-w-xl mx-auto py-10 px-4">
            <div className="flex justify-between items-center mb-8">
                <button onClick={() => navigate('/clubvip')} className="flex items-center gap-2 text-[10px] font-black text-gray-500 uppercase tracking-widest hover:text-white transition-colors">
                    <ArrowLeftIcon className="w-4 h-4" /> <span>Voltar ao Clube</span>
                </button>
                {searched && memberships.length > 0 && (
                    <button onClick={handleLogout} className="flex items-center gap-2 text-[10px] font-black text-red-500/70 uppercase tracking-widest hover:text-red-400 transition-colors">
                        <LogoutIcon className="w-4 h-4" /> TROCAR CONTA
                    </button>
                )}
            </div>

            {!searched || isLoading ? (
                <div className="bg-secondary/40 backdrop-blur-xl shadow-2xl rounded-[3rem] p-10 border border-white/5 text-center animate-fadeIn">
                    <div className="w-16 h-16 bg-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-6 text-primary border border-primary/20">
                        <SearchIcon className="w-8 h-8" />
                    </div>
                    <h1 className="text-3xl font-black text-white mb-2 uppercase tracking-tighter">CONSULTA <span className="text-primary">VIP</span></h1>
                    <p className="text-gray-400 text-sm mb-8 font-medium">Veja o status das suas adesões.</p>
                    <form onSubmit={(e) => { e.preventDefault(); performSearch(email); }} className="space-y-4">
                        <input 
                            type="email" value={email} onChange={(e) => setEmail(e.target.value)} 
                            placeholder="E-mail usado na adesão" 
                            className="w-full px-6 py-5 border border-gray-700 rounded-[1.5rem] bg-dark text-white focus:ring-2 focus:ring-primary outline-none transition-all font-bold text-center" required 
                        />
                        <button type="submit" disabled={isLoading} className="w-full py-5 bg-primary text-white font-black rounded-[1.5rem] hover:bg-primary-dark transition-all shadow-xl shadow-primary/20 disabled:opacity-50 uppercase text-xs tracking-widest">
                            {isLoading ? 'SINCROIZANDO...' : 'CONSULTAR STATUS'}
                        </button>
                    </form>
                </div>
            ) : (
                <div className="space-y-8 animate-fadeIn">
                    <div className="text-center">
                        <h1 className="text-3xl font-black text-white uppercase tracking-tighter">MEUS BENEFÍCIOS</h1>
                        <p className="text-[10px] text-gray-500 font-mono mt-2 bg-gray-800/50 inline-block px-3 py-1 rounded-full uppercase">{email}</p>
                    </div>

                    <div className="space-y-6">
                        {memberships.map(m => {
                            const event = vipEventsMap[m.vipEventId];
                            const directLink = event?.externalSlug && m.benefitCode 
                                ? `https://stingressos.com.br/eventos/${event.externalSlug}?cupom=${m.benefitCode}`
                                : null;

                            return (
                                <div key={m.id} className="bg-secondary/60 backdrop-blur-lg rounded-[2.5rem] p-8 border border-white/5 shadow-2xl">
                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="w-14 h-14 bg-primary/20 rounded-2xl flex items-center justify-center text-primary shadow-lg border border-primary/20">
                                            <SparklesIcon className="w-8 h-8" />
                                        </div>
                                        <div className="text-left">
                                            <h2 className="text-xl font-black text-white uppercase tracking-tight leading-none">{m.vipEventName}</h2>
                                            <p className="text-[9px] text-primary font-black uppercase tracking-[0.3em] mt-2">Membro Clube VIP</p>
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        {m.isBenefitActive ? (
                                            <div className="p-5 bg-green-500/10 rounded-2xl border border-green-500/30 text-center">
                                                <CheckCircleIcon className="w-8 h-8 text-green-500 mx-auto mb-2" />
                                                <p className="text-green-400 font-black uppercase tracking-widest text-xs">INGRESSO PROMOCIONAL DISPONÍVEL! 🚀</p>
                                            </div>
                                        ) : (
                                            <div className="p-5 bg-orange-500/10 rounded-2xl border border-orange-500/30 text-center">
                                                <ClockIcon className="w-8 h-8 text-orange-500 mx-auto mb-2" />
                                                <p className="text-white font-black uppercase tracking-widest text-xs">LIBERAÇÃO EM ANDAMENTO</p>
                                                <p className="text-[10px] text-orange-300 uppercase font-bold mt-1 leading-tight">Pagamento detectado. Aguarde a liberação do seu código exclusivo.</p>
                                            </div>
                                        )}

                                        <div className="bg-dark/60 p-6 rounded-3xl border border-white/5 space-y-4">
                                            <div>
                                                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest text-center mb-2">Código Promocional</p>
                                                <div 
                                                    onClick={() => m.isBenefitActive && m.benefitCode && handleCopy(m.benefitCode)}
                                                    className={`p-4 bg-black/40 rounded-2xl border border-primary/20 text-center select-all flex items-center justify-between transition-all group/code ${m.isBenefitActive ? 'cursor-pointer hover:bg-black/60' : ''}`}
                                                    title={m.isBenefitActive ? "Clique para copiar" : ""}
                                                >
                                                    <p className="text-2xl font-black text-primary font-mono group-hover/code:scale-105 transition-transform">{m.isBenefitActive ? (m.benefitCode || '---') : '******'}</p>
                                                    {m.isBenefitActive && (
                                                        <div className="p-2 text-gray-600 hover:text-white">
                                                            <DocumentDuplicateIcon className="w-5 h-5"/>
                                                        </div>
                                                    )}
                                                </div>
                                                {m.isBenefitActive && <p className="text-[8px] text-gray-500 uppercase font-black text-center mt-2 tracking-widest">Clique no código para copiar</p>}
                                            </div>

                                            {m.isBenefitActive && directLink && (
                                                <a 
                                                    href={directLink} 
                                                    target="_blank" 
                                                    rel="noreferrer"
                                                    className="block w-full py-5 bg-green-600 text-white font-black rounded-2xl text-center shadow-lg shadow-green-900/20 hover:bg-green-500 transition-all uppercase text-xs tracking-widest flex items-center justify-center gap-2"
                                                >
                                                    <ExternalLinkIcon className="w-5 h-5" /> RESGATAR AGORA
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ClubVipStatus;
