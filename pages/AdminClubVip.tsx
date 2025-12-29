
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { firestore } from '../firebase/config';
import { Promoter, PromoterStatus, Timestamp } from '../types';
import { updatePromoter } from '../services/promoterService';
import { 
    ArrowLeftIcon, SearchIcon, CheckCircleIcon, XIcon, 
    EyeIcon, TicketIcon, RefreshIcon, ClockIcon, UserIcon 
} from '../components/Icons';
import PhotoViewerModal from '../components/PhotoViewerModal';

const AdminClubVip: React.FC = () => {
    const navigate = useNavigate();
    const { selectedOrgId, adminData, loading: authLoading } = useAdminAuth();
    
    const [members, setMembers] = useState<Promoter[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<'pending' | 'confirmed' | 'rejected' | 'all'>('pending');
    const [searchQuery, setSearchQuery] = useState('');
    const [isActionLoading, setIsActionLoading] = useState<string | null>(null);
    
    const [photoViewer, setPhotoViewer] = useState({ isOpen: false, url: '' });

    const fetchData = useCallback(async () => {
        // Se não houver organização selecionada, não há o que buscar, mas paramos o loading
        if (!selectedOrgId) {
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        try {
            const snap = await firestore.collection('promoters')
                .where('organizationId', '==', selectedOrgId)
                .get();
            
            const all = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promoter));
            // Filtra apenas quem interagiu com o Clube (status != 'none')
            const vipMembers = all.filter(p => p.emocoesStatus && p.emocoesStatus !== 'none');
            setMembers(vipMembers);
        } catch (e) {
            console.error("Erro ao carregar membros VIP:", e);
        } finally {
            setIsLoading(false);
        }
    }, [selectedOrgId]);

    // Dispara a busca quando o Auth termina de carregar ou a Org muda
    useEffect(() => {
        if (!authLoading) {
            fetchData();
        }
    }, [authLoading, selectedOrgId, fetchData]);

    const handleApprove = async (promoter: Promoter) => {
        const code = window.prompt("Insira o Código do Ingresso ou Link de Desconto para esta pessoa:", promoter.emocoesBenefitCode || "VIP-PROMO-2024");
        if (code === null) return;

        setIsActionLoading(promoter.id);
        try {
            await updatePromoter(promoter.id, {
                emocoesStatus: 'confirmed',
                emocoesBenefitCode: code,
                actionTakenByEmail: adminData?.email
            });
            await fetchData();
        } catch (e) {
            alert("Erro ao aprovar.");
        } finally {
            setIsActionLoading(null);
        }
    };

    const handleReject = async (promoterId: string) => {
        if (!window.confirm("Rejeitar este comprovante? A pessoa poderá enviar um novo se desejar via página da promoção.")) return;
        
        setIsActionLoading(promoterId);
        try {
            await updatePromoter(promoterId, {
                emocoesStatus: 'rejected',
                actionTakenByEmail: adminData?.email
            });
            await fetchData();
        } catch (e) {
            alert("Erro ao rejeitar.");
        } finally {
            setIsActionLoading(null);
        }
    };

    const filteredMembers = useMemo(() => {
        return members.filter(m => {
            const matchesStatus = filterStatus === 'all' || m.emocoesStatus === filterStatus;
            const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase()) || m.email.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesStatus && matchesSearch;
        }).sort((a, b) => {
            const timeA = (a.statusChangedAt as any)?.seconds || 0;
            const timeB = (b.statusChangedAt as any)?.seconds || 0;
            return timeB - timeA;
        });
    }, [members, filterStatus, searchQuery]);

    const getStatusBadge = (status: string) => {
        const cfg = {
            pending: { label: "Pendente", style: "bg-yellow-900/40 text-yellow-400 border-yellow-800" },
            confirmed: { label: "Ativo", style: "bg-green-900/40 text-green-400 border-green-800" },
            rejected: { label: "Recusado", style: "bg-red-900/40 text-red-400 border-red-800" }
        };
        const s = cfg[status as keyof typeof cfg] || cfg.pending;
        return <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${s.style}`}>{s.label}</span>;
    };

    return (
        <div className="pb-20">
            <div className="flex justify-between items-center mb-8 px-4 md:px-0">
                <h1 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                    <TicketIcon className="w-8 h-8 text-primary" />
                    Gestão Clube VIP
                </h1>
                <button onClick={() => navigate(-1)} className="p-2 bg-gray-800 text-gray-400 rounded-xl hover:text-white transition-colors">
                    <ArrowLeftIcon className="w-5 h-5"/>
                </button>
            </div>

            <div className="bg-secondary/60 backdrop-blur-xl rounded-[2.5rem] p-6 border border-white/5 shadow-2xl space-y-6">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-grow">
                        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input 
                            type="text" placeholder="Buscar por nome ou e-mail..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-sm focus:ring-1 focus:ring-primary outline-none"
                        />
                    </div>
                    <div className="flex bg-dark p-1 rounded-2xl border border-gray-700 overflow-x-auto">
                        {(['pending', 'confirmed', 'rejected', 'all'] as const).map(s => (
                            <button key={s} onClick={() => setFilterStatus(s)} className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all whitespace-nowrap ${filterStatus === s ? 'bg-primary text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>
                                {{'pending':'Pendentes','confirmed':'Ativos','rejected':'Recusados','all':'Todos'}[s]}
                            </button>
                        ))}
                    </div>
                </div>

                {isLoading ? (
                    <div className="py-20 text-center flex flex-col items-center gap-4">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Sincronizando membros...</p>
                    </div>
                ) : filteredMembers.length === 0 ? (
                    <div className="py-20 text-center bg-dark/40 rounded-3xl border border-dashed border-gray-800">
                        <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Nenhum pedido encontrado nesta categoria.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredMembers.map(member => (
                            <div key={member.id} className="bg-dark/40 rounded-[2rem] border border-white/5 overflow-hidden group hover:border-white/10 transition-all flex flex-col">
                                <div className="p-6">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center text-primary border border-primary/20">
                                                <UserIcon className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-white uppercase tracking-tight truncate max-w-[150px]">{member.name}</p>
                                                {getStatusBadge(member.emocoesStatus!)}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[8px] text-gray-500 font-black uppercase tracking-widest">Solicitado em</p>
                                            <p className="text-[10px] text-gray-400 font-bold">{(member.statusChangedAt as any)?.toDate().toLocaleDateString('pt-BR')}</p>
                                        </div>
                                    </div>

                                    {member.emocoesProofUrl && (
                                        <div className="mb-4 relative group/img cursor-pointer" onClick={() => setPhotoViewer({ isOpen: true, url: member.emocoesProofUrl! })}>
                                            <img src={member.emocoesProofUrl} alt="Comprovante" className="w-full h-32 object-cover rounded-2xl border border-gray-700 group-hover/img:opacity-50 transition-all" />
                                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity">
                                                <EyeIcon className="w-8 h-8 text-white" />
                                            </div>
                                        </div>
                                    )}

                                    {member.emocoesStatus === 'confirmed' && (
                                        <div className="mb-4 p-3 bg-green-900/20 rounded-xl border border-green-800/30">
                                            <p className="text-[8px] text-green-500 font-black uppercase mb-1">Código/Link Ativo:</p>
                                            <p className="text-xs text-white font-mono font-bold truncate">{member.emocoesBenefitCode || 'Nenhum'}</p>
                                        </div>
                                    )}

                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => handleApprove(member)}
                                            disabled={isActionLoading === member.id}
                                            className="flex-1 py-3 bg-green-600 text-white font-black rounded-xl text-[10px] uppercase tracking-widest hover:bg-green-500 transition-all flex items-center justify-center gap-2"
                                        >
                                            {isActionLoading === member.id ? <RefreshIcon className="w-4 h-4 animate-spin" /> : <CheckCircleIcon className="w-4 h-4" />}
                                            {member.emocoesStatus === 'confirmed' ? 'Editar Código' : 'Aprovar'}
                                        </button>
                                        {member.emocoesStatus === 'pending' && (
                                            <button 
                                                onClick={() => handleReject(member.id)}
                                                disabled={isActionLoading === member.id}
                                                className="px-4 py-3 bg-red-900/30 text-red-400 rounded-xl border border-red-900/50 hover:bg-red-900/50 transition-all"
                                            >
                                                <XIcon className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {photoViewer.isOpen && (
                <PhotoViewerModal 
                    imageUrls={[photoViewer.url]} 
                    startIndex={0} 
                    isOpen={photoViewer.isOpen} 
                    onClose={() => setPhotoViewer({ ...photoViewer, isOpen: false })} 
                />
            )}
        </div>
    );
};

export default AdminClubVip;
