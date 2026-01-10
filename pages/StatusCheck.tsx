
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { checkPromoterStatus, confirmPromoterGroupEntry } from '../services/promoterService';
import { getAllVipMemberships } from '../services/vipService';
import { getAllCampaigns } from '../services/settingsService';
import { Promoter, Campaign, VipMembership } from '../types';
import { WhatsAppIcon, ArrowLeftIcon, LogoutIcon, CheckCircleIcon, ClockIcon, XIcon, PencilIcon, SearchIcon, AlertTriangleIcon, SparklesIcon, MegaphoneIcon, TicketIcon } from '../components/Icons';
import { getOrganizations } from '../services/organizationService';
import VipTicket from '../components/VipTicket';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  rules: string;
  campaignName: string;
}

const RulesModal: React.FC<RulesModalProps> = ({ isOpen, onClose, rules, campaignName }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-[100] p-4" onClick={onClose}>
      <div className="bg-secondary rounded-3xl shadow-2xl p-8 w-full max-w-2xl max-h-[85vh] flex flex-col border border-white/10" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-black text-white uppercase tracking-tight">Regras: {campaignName}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors"><XIcon className="w-6 h-6" /></button>
        </div>
        <div className="flex-grow overflow-y-auto pr-2 space-y-4 text-gray-300 text-sm leading-relaxed">
           <div dangerouslySetInnerHTML={{ __html: rules?.replace(/\n/g, '<br />') || 'Nenhuma regra cadastrada.' }} />
        </div>
        <div className="mt-8 flex justify-end">
          <button onClick={onClose} className="px-8 py-3 bg-primary text-white font-black rounded-2xl hover:bg-primary-dark transition-all uppercase text-xs tracking-widest">Entendi</button>
        </div>
      </div>
    </div>
  );
};

const RegistrationItem: React.FC<{ promoter: Promoter; orgName: string; allCampaigns: Campaign[] }> = ({ promoter, orgName, allCampaigns }) => {
    const [isExpanded, setIsExpanded] = useState(promoter.status === 'rejected_editable');
    const [hasAcceptedRules, setHasAcceptedRules] = useState(promoter.hasJoinedGroup || false);
    const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);

    const campaign = useMemo(() => 
        allCampaigns.find(c => 
            c.name.trim().toLowerCase() === promoter.campaignName?.trim().toLowerCase() && 
            c.organizationId === promoter.organizationId
        ),
    [allCampaigns, promoter]);

    const statusStyles = {
        pending: "bg-blue-900/30 text-blue-400 border-blue-800/50",
        approved: "bg-green-900/30 text-green-400 border-green-800/50",
        rejected: "bg-red-900/30 text-red-400 border-red-800/50",
        rejected_editable: "bg-orange-900/30 text-orange-400 border-orange-800/50",
        removed: "bg-gray-800 text-gray-500 border-gray-700"
    };

    const statusLabels = {
        pending: "Em Análise",
        approved: "Aprovada",
        rejected: "Recusada",
        rejected_editable: "Ajuste Necessário",
        removed: "Removida"
    };

    const handleAcceptRules = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const isChecked = e.target.checked;
        setHasAcceptedRules(isChecked);
        if (isChecked && !promoter.hasJoinedGroup) {
            try { await confirmPromoterGroupEntry(promoter.id); } catch (err) { setHasAcceptedRules(false); }
        }
    };

    return (
        <div className={`bg-gray-800/40 rounded-2xl border ${promoter.status === 'rejected_editable' ? 'border-orange-500/50 shadow-[0_0_15px_rgba(249,115,22,0.1)]' : 'border-white/5'} overflow-hidden transition-all hover:border-white/10`}>
            <div 
                className="p-4 flex items-center justify-between cursor-pointer active:bg-white/5"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex-grow overflow-hidden text-left">
                    <p className="text-white font-bold text-sm truncate uppercase tracking-tight">{promoter.campaignName || 'Geral'}</p>
                    <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest mt-0.5">{promoter.state} • {orgName}</p>
                </div>
                <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${statusStyles[promoter.status]}`}>
                        {statusLabels[promoter.status]}
                    </span>
                    <div className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                        <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                </div>
            </div>

            {isExpanded && (
                <div className="px-4 pb-5 pt-2 border-t border-white/5 animate-slideDown">
                    {promoter.status === 'rejected_editable' && (
                        <div className="mb-6 p-4 bg-orange-900/20 rounded-2xl border border-orange-500/30">
                            <div className="flex items-center gap-3 mb-2">
                                <AlertTriangleIcon className="w-5 h-5 text-orange-400" />
                                <h4 className="text-sm font-black text-orange-400 uppercase">Seu cadastro precisa de ajustes!</h4>
                            </div>
                            <p className="text-xs text-gray-300 mb-4 leading-relaxed font-medium italic">
                                "{promoter.rejectionReason || 'Clique no botão abaixo para revisar seus dados.'}"
                            </p>
                            <Link 
                                to={`/${promoter.organizationId}/register/${promoter.state}/${encodeURIComponent(promoter.campaignName || '')}?edit_id=${promoter.id}`} 
                                className="flex items-center justify-center gap-2 w-full py-4 bg-orange-600 text-white font-black rounded-2xl text-xs uppercase tracking-widest hover:bg-orange-500 transition-all shadow-lg shadow-orange-900/40 transform active:scale-95"
                            >
                                <PencilIcon className="w-4 h-4" /> CORRIGIR MEU CADASTRO AGORA
                            </Link>
                        </div>
                    )}

                    {promoter.rejectionReason && promoter.status === 'rejected' && (
                        <div className="mb-4 bg-red-900/20 p-3 rounded-xl border border-red-900/30">
                            <p className="text-[10px] text-red-300 leading-relaxed font-medium italic">Motivo: {promoter.rejectionReason}</p>
                        </div>
                    )}

                    {campaign && (
                        <div className="space-y-4 mt-2 bg-dark/30 p-4 rounded-2xl border border-white/5">
                            <div className="flex items-start gap-3">
                                <div className="w-5 h-5 bg-primary/20 rounded-full flex items-center justify-center text-[10px] font-black text-primary border border-primary/20 flex-shrink-0">1</div>
                                <div className="flex-grow text-left">
                                    <p className="text-[10px] font-bold text-gray-200 uppercase tracking-widest">Leia as Regras</p>
                                    <div className="flex flex-col sm:flex-row gap-3 mt-2">
                                        <button onClick={() => setIsRulesModalOpen(true)} className="px-3 py-1.5 bg-gray-700 text-white text-[9px] font-black rounded-lg border border-gray-600 uppercase tracking-widest hover:bg-gray-600 transition-colors">VER REGRAS DO EVENTO</button>
                                        
                                        {promoter.status === 'approved' && (
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" checked={hasAcceptedRules} onChange={handleAcceptRules} className="w-4 h-4 rounded bg-gray-900 border-gray-700 text-primary focus:ring-0" />
                                                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">LI E CONCORDO</span>
                                            </label>
                                        )}
                                    </div>
                                </div>
                            </div>
                            
                            {promoter.status === 'approved' && (
                                <div className="flex items-start gap-3 border-t border-white/5 pt-4">
                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black border transition-colors flex-shrink-0 ${hasAcceptedRules ? 'bg-green-600 text-white border-green-500' : 'bg-gray-800 text-gray-600 border-gray-700'}`}>2</div>
                                    <div className="flex-grow text-left">
                                        <p className="text-[10px] font-bold text-gray-200 uppercase tracking-widest">Grupo do Evento</p>
                                        <a 
                                            href={hasAcceptedRules ? campaign.whatsappLink : undefined} 
                                            target="_blank" 
                                            rel="noreferrer"
                                            className={`mt-2 inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-black rounded-xl text-[9px] uppercase tracking-widest transition-all ${!hasAcceptedRules ? 'opacity-30 grayscale cursor-not-allowed' : 'hover:scale-105 active:scale-95 shadow-lg shadow-green-900/20'}`}
                                            onClick={(e) => !hasAcceptedRules && e.preventDefault()}
                                        >
                                            <WhatsAppIcon className="w-3.5 h-3.5" /> ENTRAR NO WHATSAPP
                                        </a>
                                    </div>
                                </div>
                            )}

                            {promoter.status === 'pending' && (
                                <div className="mt-2 p-2 bg-blue-900/10 rounded-lg border border-blue-900/20">
                                    <p className="text-[9px] text-blue-300 uppercase font-black leading-tight text-left">
                                        Seu perfil está sendo analisado. O link do grupo será liberado assim que você for aprovada.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
            {campaign && <RulesModal isOpen={isRulesModalOpen} onClose={() => setIsRulesModalOpen(false)} rules={campaign.rules} campaignName={campaign.name} />}
        </div>
    );
};

const StatusCheck: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [promoters, setPromoters] = useState<Promoter[]>([]);
    const [vipMemberships, setVipMemberships] = useState<VipMembership[]>([]);
    const [orgMap, setOrgMap] = useState<Record<string, string>>({});
    const [allCampaigns, setAllCampaigns] = useState<Campaign[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searched, setSearched] = useState(false);
    
    const [showTicketFor, setShowTicketFor] = useState<VipMembership | null>(null);
    
    const performSearch = useCallback(async (searchEmail: string) => {
        if (!searchEmail) return;
        setIsLoading(true); setError(null); setSearched(true);
        try {
            const trimmed = searchEmail.toLowerCase().trim();
            const [result, orgs, campaigns, allVip] = await Promise.all([
                checkPromoterStatus(trimmed),
                getOrganizations(),
                getAllCampaigns(),
                getAllVipMemberships('all')
            ]);
            
            setPromoters(result);
            setVipMemberships(allVip.filter(m => m.promoterEmail === trimmed && m.status === 'confirmed'));
            
            const map = orgs.reduce((acc, org) => { acc[org.id] = org.name; return acc; }, {} as Record<string, string>);
            setOrgMap(map);
            setAllCampaigns(campaigns);
            
            if (result.length > 0 || allVip.some(m => m.promoterEmail === trimmed)) {
                localStorage.setItem('saved_promoter_email', trimmed);
            }
        } catch (err: any) {
            setError('Ocorreu um erro ao buscar seus dados.');
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
        setPromoters([]); setVipMemberships([]); setSearched(false); setEmail('');
    };

    const groupedPromoters = useMemo(() => {
        return promoters.reduce((acc, p) => {
            if (p.organizationId === 'club-vip-global') return acc; // Ignora o modelo antigo de registro VIP
            if (!acc[p.organizationId]) acc[p.organizationId] = [];
            acc[p.organizationId].push(p);
            return acc;
        }, {} as Record<string, Promoter[]>);
    }, [promoters]);

    const hasAnyApprovedJob = useMemo(() => {
        return promoters.some(p => p.status === 'approved' && p.organizationId !== 'club-vip-global');
    }, [promoters]);

    return (
        <div className="max-w-xl mx-auto py-6 px-4">
            <div className="flex justify-between items-center mb-10">
                <button onClick={() => navigate('/')} className="flex items-center gap-2 text-[10px] font-black text-gray-500 uppercase tracking-widest hover:text-white transition-colors">
                    <ArrowLeftIcon className="w-4 h-4" /> <span>Início</span>
                </button>
                {searched && (promoters.length > 0 || vipMemberships.length > 0) && (
                    <button onClick={handleLogout} className="flex items-center gap-2 text-[10px] font-black text-red-500/70 uppercase tracking-widest hover:text-red-400 transition-colors">
                        <LogoutIcon className="w-4 h-4" /> TROCAR CONTA
                    </button>
                )}
            </div>

            {!searched || isLoading ? (
                <div className="bg-secondary/40 backdrop-blur-xl shadow-2xl rounded-[2.5rem] p-10 border border-white/5 text-center animate-fadeIn">
                    <div className="w-16 h-16 bg-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-6 text-primary border border-primary/20">
                        <SearchIcon className="w-8 h-8" />
                    </div>
                    <h1 className="text-3xl font-black text-white mb-2 uppercase tracking-tighter">MEU STATUS</h1>
                    <p className="text-gray-400 text-sm mb-8 font-medium">Consulte suas aprovações e ingressos VIP.</p>
                    <form onSubmit={(e) => { e.preventDefault(); performSearch(email); }} className="space-y-4">
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Seu e-mail cadastrado" className="w-full px-6 py-5 border border-gray-700 rounded-[1.5rem] bg-gray-800/50 text-white focus:ring-2 focus:ring-primary outline-none transition-all font-bold" required />
                        <button type="submit" disabled={isLoading} className="w-full py-5 bg-primary text-white font-black rounded-[1.5rem] hover:bg-primary-dark transition-all shadow-xl shadow-primary/20 disabled:opacity-50 uppercase text-xs tracking-widest">
                            {isLoading ? 'SINCROIZANDO...' : 'CONSULTAR AGORA'}
                        </button>
                    </form>
                </div>
            ) : (
                <div className="space-y-10 animate-fadeIn pb-20">
                    <div className="text-center">
                        <h1 className="text-3xl font-black text-white uppercase tracking-tighter">SUA CONTA</h1>
                        <p className="text-[10px] text-gray-500 font-mono mt-2 bg-gray-800/50 inline-block px-3 py-1 rounded-full uppercase">{email}</p>
                    </div>

                    {/* SEÇÃO VIP - NOVO MODELO */}
                    {vipMemberships.length > 0 && (
                        <div className="space-y-6">
                            <div className="flex items-center gap-3 ml-4">
                                <div className="w-8 h-8 bg-primary/20 rounded-xl flex items-center justify-center">
                                    <SparklesIcon className="w-4 h-4 text-primary" />
                                </div>
                                <h2 className="text-lg font-black text-white uppercase tracking-tight">Meus Ingressos VIP</h2>
                            </div>
                            
                            <div className="grid gap-6">
                                {vipMemberships.map(m => (
                                    <div key={m.id} className="bg-secondary/60 backdrop-blur-lg rounded-[2.5rem] p-8 border border-primary/20 shadow-2xl relative group overflow-hidden">
                                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/10 rounded-full blur-3xl group-hover:bg-primary/20 transition-all"></div>
                                        <div className="flex justify-between items-start mb-6">
                                            <div className="text-left">
                                                <h2 className="text-2xl font-black text-white uppercase tracking-tighter leading-none">{m.vipEventName}</h2>
                                                <p className="text-[9px] text-primary font-black uppercase tracking-[0.3em] mt-2">Confirmado ✅</p>
                                            </div>
                                            <div className="p-3 bg-primary/10 rounded-xl text-primary"><TicketIcon className="w-6 h-6"/></div>
                                        </div>
                                        
                                        <div className="p-4 bg-dark/60 rounded-2xl border border-white/5 space-y-4">
                                            <div className="text-center">
                                                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">Código de Acesso</p>
                                                <p className="text-2xl font-black text-primary font-mono">{m.benefitCode || '---'}</p>
                                            </div>
                                            <button 
                                                onClick={() => setShowTicketFor(m)}
                                                className="w-full py-4 bg-primary text-white font-black rounded-xl text-[10px] uppercase tracking-widest shadow-lg hover:bg-primary-dark transition-all transform active:scale-95"
                                            >
                                                VER MEU INGRESSO DIGITAL
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* SEÇÃO EQUIPE */}
                    {(Object.entries(groupedPromoters) as [string, Promoter[]][]).length > 0 && (
                        <div className="space-y-6 pt-4 border-t border-white/5">
                            {(Object.entries(groupedPromoters) as [string, Promoter[]][]).map(([orgId, registrations]) => (
                                <div key={orgId} className="space-y-4">
                                    <div className="flex items-center gap-3 ml-4">
                                        <div className="w-8 h-8 bg-white/5 rounded-xl flex items-center justify-center">
                                            <MegaphoneIcon className="w-4 h-4 text-primary" />
                                        </div>
                                        <h2 className="text-lg font-black text-white uppercase tracking-tight">{orgMap[orgId] || 'Produtora'}</h2>
                                    </div>
                                    <div className="space-y-3">
                                        {registrations.map(p => (
                                            <RegistrationItem key={p.id} promoter={p} orgName={orgMap[orgId]} allCampaigns={allCampaigns} />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {!promoters.length && !vipMemberships.length && (
                        <div className="bg-secondary/40 p-10 rounded-[2.5rem] border border-white/5 text-center">
                            <XIcon className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                            <p className="text-gray-400 font-bold uppercase text-xs tracking-widest">Nenhum registro encontrado.</p>
                            <button onClick={() => navigate('/')} className="mt-6 text-primary font-black uppercase text-[10px] tracking-widest hover:underline">Ir para Início</button>
                        </div>
                    )}

                    {hasAnyApprovedJob && (
                        <button onClick={() => navigate('/posts')} className="w-full py-5 bg-white text-dark font-black rounded-3xl shadow-xl hover:bg-gray-100 transition-all uppercase text-xs tracking-[0.2em] flex items-center justify-center gap-2">
                            PORTAL DE TAREFAS <ArrowLeftIcon className="w-4 h-4 rotate-180" />
                        </button>
                    )}
                </div>
            )}

            {showTicketFor && (
                <VipTicket 
                    membership={showTicketFor} 
                    onClose={() => setShowTicketFor(null)} 
                />
            )}
        </div>
    );
};

export default StatusCheck;
