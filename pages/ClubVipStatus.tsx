
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getAllVipMemberships, getActiveVipEvents } from '../services/vipService';
import { findPromotersByEmail } from '../services/promoterService';
import { VipMembership, VipEvent } from '../types';
import { 
    ArrowLeftIcon, SearchIcon, SparklesIcon, CheckCircleIcon, 
    ClockIcon, LogoutIcon, TicketIcon, 
    AlertTriangleIcon, DownloadIcon, RefreshIcon 
} from '../components/Icons';
import VipTicket from '../components/VipTicket';

const ClubVipStatus: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [email, setEmail] = useState('');
    const [memberships, setMemberships] = useState<VipMembership[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const [showTicketFor, setShowTicketFor] = useState<VipMembership | null>(null);
    const [isDownloadingPDF, setIsDownloadingPDF] = useState<string | null>(null);

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
                const enrichedMemb = userMemb.map(m => {
                    const ev = allEvents.find(e => e.id === m.vipEventId);
                    return {
                        ...m,
                        eventTime: ev?.eventTime,
                        eventLocation: ev?.eventLocation
                    };
                });
                setMemberships(enrichedMemb);
                localStorage.setItem('saved_promoter_email', trimmed);
            }
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
        setError(null);
    };

    const handleDownloadPDF = async (membership: VipMembership) => {
        if (isDownloadingPDF) return;
        
        setIsDownloadingPDF(membership.id);
        
        // Pequena pausa para garantir que o QR Code e o SVG da logo renderizaram
        setTimeout(async () => {
            const element = document.getElementById(`ticket-content-${membership.id}`);
            if (!element) {
                setIsDownloadingPDF(null);
                return;
            }

            const options = {
                margin: 0,
                filename: `VIP_${membership.promoterName.split(' ')[0].toUpperCase()}_${membership.vipEventName.replace(/\s+/g, '_')}.pdf`,
                image: { type: 'jpeg', quality: 1.0 },
                html2canvas: { 
                    scale: 3, // Alta resolução
                    useCORS: true, 
                    backgroundColor: '#000000',
                    logging: false,
                    scrollY: 0,
                    scrollX: 0,
                    windowWidth: 400,
                    windowHeight: 700
                },
                jsPDF: { 
                    unit: 'px', 
                    format: [400, 700], // Mesmas dimensões do elemento no VipTicket
                    orientation: 'portrait',
                    hotfixes: ['px_scaling']
                }
            };

            try {
                const html2pdf = (window as any).html2pdf;
                await html2pdf().set(options).from(element).save();
            } catch (err) {
                console.error("Erro ao gerar PDF:", err);
                alert("Falha ao gerar PDF. Sugerimos tirar um print do ingresso.");
            } finally {
                setIsDownloadingPDF(null);
            }
        }, 1200);
    };

    return (
        <div className="max-w-xl mx-auto py-10 px-4">
            
            {/* CONTAINER PARA EXPORTAÇÃO (FORA DA TELA) */}
            <div className="fixed left-[-2000px] top-0 pointer-events-none" aria-hidden="true" style={{ width: '400px' }}>
                {memberships.map(m => (
                    <div key={`export-${m.id}`}>
                        <VipTicket membership={m} isExporting={true} />
                    </div>
                ))}
            </div>

            <div className="flex justify-between items-center mb-8">
                <button onClick={() => navigate('/clubvip')} className="flex items-center gap-2 text-[10px] font-black text-gray-500 uppercase tracking-widest hover:text-white transition-colors">
                    <ArrowLeftIcon className="w-4 h-4" /> <span>Voltar ao Clube</span>
                </button>
                {searched && (
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
                    <p className="text-gray-400 text-sm mb-8 font-medium">Acesse seu ingresso digital e benefícios.</p>
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

                    {error && (
                        <div className="bg-red-900/20 border border-red-500/50 p-8 rounded-[2rem] text-center space-y-4">
                            <AlertTriangleIcon className="w-12 h-12 text-red-500 mx-auto" />
                            <p className="text-white font-bold">{error}</p>
                        </div>
                    )}

                    <div className="space-y-6">
                        {memberships.map(m => (
                            <div key={m.id} className="bg-secondary/60 backdrop-blur-lg rounded-[2.5rem] p-8 border border-white/5 shadow-2xl overflow-hidden relative">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="w-14 h-14 bg-primary/20 rounded-2xl flex items-center justify-center text-primary shadow-lg border border-primary/20">
                                        <SparklesIcon className="w-8 h-8" />
                                    </div>
                                    <div className="text-left">
                                        <h2 className="text-xl font-black text-white uppercase tracking-tight leading-none">{m.vipEventName}</h2>
                                        <p className="text-[8px] text-primary font-black uppercase tracking-[0.3em] mt-2">Membro Clube VIP</p>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    {m.isBenefitActive ? (
                                        <div className="p-5 bg-green-500/10 rounded-2xl border border-green-500/30 text-center">
                                            <CheckCircleIcon className="w-8 h-8 text-green-500 mx-auto mb-2" />
                                            <p className="text-green-400 font-black uppercase tracking-widest text-xs">ACESSO LIBERADO! 🚀</p>
                                        </div>
                                    ) : (
                                        <div className="p-5 bg-orange-500/10 rounded-2xl border border-orange-500/30 text-center">
                                            <ClockIcon className="w-8 h-8 text-orange-500 mx-auto mb-2" />
                                            <p className="text-white font-black uppercase tracking-widest text-xs">LIBERAÇÃO EM ANDAMENTO</p>
                                            <p className="text-[10px] text-orange-300 uppercase font-bold mt-2 leading-tight">
                                                Pagamento confirmado! Seu ingresso digital<br/>está sendo gerado agora.
                                            </p>
                                        </div>
                                    )}

                                    <div className="bg-dark/60 p-6 rounded-3xl border border-white/5 space-y-5">
                                        <div className="text-center">
                                            <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-3">Seu Código Exclusivo</p>
                                            <p className="text-3xl font-black text-primary font-mono tracking-tighter">{m.isBenefitActive ? (m.benefitCode || '---') : '******'}</p>
                                        </div>

                                        {m.isBenefitActive && (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                                                <button 
                                                    onClick={() => setShowTicketFor(m)}
                                                    className="w-full py-4 bg-gray-800 text-white font-black rounded-2xl text-center border border-white/5 shadow-lg hover:bg-gray-700 transition-all uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 active:scale-95"
                                                >
                                                    <TicketIcon className="w-4 h-4" /> VISUALIZAR
                                                </button>
                                                <button 
                                                    onClick={() => handleDownloadPDF(m)}
                                                    disabled={isDownloadingPDF === m.id}
                                                    className="w-full py-4 bg-primary text-white font-black rounded-2xl text-center shadow-lg shadow-primary/20 hover:bg-primary-dark transition-all uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                                                >
                                                    {isDownloadingPDF === m.id ? (
                                                        <RefreshIcon className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <DownloadIcon className="w-4 h-4" />
                                                    )}
                                                    BAIXAR PDF
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* MODAL DO INGRESSO */}
            {showTicketFor && (
                <VipTicket 
                    membership={showTicketFor} 
                    onClose={() => setShowTicketFor(null)} 
                />
            )}
        </div>
    );
};

export default ClubVipStatus;
