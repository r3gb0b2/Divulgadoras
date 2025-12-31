
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getAllPromoters, updatePromoter } from '../services/promoterService';
import { getOrganizations } from '../services/organizationService';
import { Promoter, RecoveryStatus, Organization } from '../types';
import { 
    ArrowLeftIcon, SearchIcon, WhatsAppIcon, InstagramIcon, 
    RefreshIcon, FilterIcon, ClockIcon, CheckCircleIcon, XIcon, UserIcon 
} from '../components/Icons';
import firebase from 'firebase/compat/app';

const RecoveryDashboard: React.FC = () => {
    const navigate = useNavigate();
    const { adminData, selectedOrgId } = useAdminAuth();
    
    const [leads, setLeads] = useState<Promoter[]>([]);
    const [organizations, setOrganizations] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<RecoveryStatus | 'all'>('none');
    const [ownerFilter, setOwnerFilter] = useState<'all' | 'me' | 'none'>('all');

    const fetchLeads = useCallback(async () => {
        setIsLoading(true);
        try {
            // Carregar todas as produtoras para o mapeamento de nomes
            const orgs = await getOrganizations();
            const orgMap = orgs.reduce((acc, o) => ({ ...acc, [o.id]: o.name }), {} as Record<string, string>);
            setOrganizations(orgMap);

            // Carregar divulgadoras rejeitadas
            // Se for superadmin, busca de todas as orgs, senão apenas da selecionada
            const orgIdToFetch = adminData?.role === 'superadmin' ? 'all' : selectedOrgId;
            
            if (!orgIdToFetch) return;

            const allPromoters = await getAllPromoters({
                organizationId: orgIdToFetch,
                filterOrgId: orgIdToFetch,
                status: 'all' // Filtraremos localmente por rejected
            });

            // Filtra apenas rejeitadas
            const rejected = allPromoters.filter(p => p.status === 'rejected' || (p.status as string) === 'rejected_editable');
            setLeads(rejected);

        } catch (e) {
            console.error("Erro ao carregar leads:", e);
        } finally {
            setIsLoading(false);
        }
    }, [adminData, selectedOrgId]);

    useEffect(() => {
        fetchLeads();
    }, [fetchLeads]);

    const filteredLeads = useMemo(() => {
        return leads.filter(p => {
            const matchesStatus = statusFilter === 'all' || (p.recoveryStatus || 'none') === statusFilter;
            const matchesSearch = 
                p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                p.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.whatsapp.includes(searchQuery);
            
            const matchesOwner = 
                ownerFilter === 'all' || 
                (ownerFilter === 'me' && p.recoveryAdminEmail === adminData?.email) ||
                (ownerFilter === 'none' && !p.recoveryAdminEmail);

            return matchesStatus && matchesSearch && matchesOwner;
        });
    }, [leads, statusFilter, searchQuery, ownerFilter, adminData]);

    const handleUpdateStatus = async (promoterId: string, status: RecoveryStatus) => {
        try {
            await updatePromoter(promoterId, {
                recoveryStatus: status,
                recoveryAdminEmail: adminData?.email,
                recoveryUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            // Atualiza localmente
            setLeads(prev => prev.map(p => 
                p.id === promoterId ? { 
                    ...p, 
                    recoveryStatus: status, 
                    recoveryAdminEmail: adminData?.email 
                } : p
            ));
        } catch (e) {
            alert("Erro ao atualizar status.");
        }
    };

    const handleStartWhatsApp = (lead: Promoter) => {
        const firstName = lead.name.split(' ')[0];
        const adminName = adminData?.email.split('@')[0];
        const msg = `Olá ${firstName}! Sou o ${adminName} da equipe de gestão. 👋\n\nVi que seu perfil não pôde ser aprovado para a equipe do evento ${lead.campaignName} no momento, mas não queremos que você fique de fora! 🚀\n\nLiberei uma cortesia VIP exclusiva pra você no nosso Clube. Você ganha benefícios e o seu ingresso sai por um valor promocional. Tem interesse em saber como funciona?`;
        
        // Atribui o admin automaticamente
        if (!lead.recoveryAdminEmail) {
            handleUpdateStatus(lead.id, 'contacted');
        }
        
        const url = `https://wa.me/55${lead.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
        window.open(url, '_blank');
    };

    return (
        <div className="pb-40">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 px-4 md:px-0">
                <div>
                    <h1 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                        <WhatsAppIcon className="w-8 h-8 text-green-500" /> Recuperação de Vendas
                    </h1>
                    <p className="text-gray-500 text-xs font-black uppercase tracking-widest mt-1">Transforme rejeições em conversões</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => fetchLeads()} className="p-3 bg-gray-800 text-gray-400 rounded-2xl hover:text-white transition-colors">
                        <RefreshIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`}/>
                    </button>
                    <button onClick={() => navigate('/admin')} className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-xl text-xs font-black uppercase tracking-widest">
                        <ArrowLeftIcon className="w-4 h-4" /> Voltar
                    </button>
                </div>
            </div>

            <div className="bg-secondary/60 backdrop-blur-xl rounded-[2.5rem] p-6 border border-white/5 shadow-2xl space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="md:col-span-2 relative">
                        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input 
                            type="text" placeholder="BUSCAR POR NOME OU WHATSAPP..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-[10px] font-black uppercase outline-none focus:border-primary"
                        />
                    </div>
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="bg-dark border border-gray-700 text-white px-4 py-3 rounded-2xl text-[10px] font-black uppercase outline-none focus:border-primary">
                        <option value="all">STATUS (TODOS)</option>
                        <option value="none">🆕 NÃO CONTATADO</option>
                        <option value="contacted">💬 EM ABERTO</option>
                        <option value="purchased">✅ VENDA FECHADA</option>
                        <option value="no_response">⌛ SEM RETORNO</option>
                    </select>
                    <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value as any)} className="bg-dark border border-gray-700 text-white px-4 py-3 rounded-2xl text-[10px] font-black uppercase outline-none focus:border-primary">
                        <option value="all">RESPONSÁVEL (TODOS)</option>
                        <option value="me">SÓ MEUS LEADS</option>
                        <option value="none">LEADS LIVRES</option>
                    </select>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-dark/50 text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-white/5">
                                <th className="px-6 py-5">Potencial Cliente</th>
                                <th className="px-6 py-5">Origem (Evento)</th>
                                <th className="px-6 py-5 text-center">Status Funil</th>
                                <th className="px-6 py-5 text-center">Responsável</th>
                                <th className="px-6 py-5 text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {isLoading ? (
                                <tr><td colSpan={5} className="text-center py-20 text-gray-500 font-black uppercase text-xs animate-pulse tracking-widest">Carregando oportunidades...</td></tr>
                            ) : filteredLeads.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-20 text-gray-500 font-black uppercase text-xs tracking-widest">Nenhum lead encontrado</td></tr>
                            ) : filteredLeads.map(p => (
                                <tr key={p.id} className="hover:bg-white/[0.02] transition-colors group">
                                    <td className="px-6 py-5">
                                        <p className="text-sm font-black text-white uppercase truncate">{p.name}</p>
                                        <div className="flex items-center gap-3 mt-1.5">
                                            <a href={`https://instagram.com/${p.instagram}`} target="_blank" rel="noreferrer" className="text-pink-500 hover:text-pink-400 transition-colors flex items-center gap-1">
                                                <InstagramIcon className="w-3.5 h-3.5" />
                                                <span className="text-[9px] font-bold">@{p.instagram}</span>
                                            </a>
                                            <p className="text-[9px] text-gray-500 font-mono">{p.whatsapp}</p>
                                        </div>
                                    </td>
                                    <td className="px-6 py-5">
                                        <p className="text-xs text-red-400 font-bold uppercase">{p.campaignName}</p>
                                        <p className="text-[9px] text-gray-600 font-black uppercase">{organizations[p.organizationId]}</p>
                                    </td>
                                    <td className="px-6 py-5 text-center">
                                        <div className="flex flex-wrap justify-center gap-1">
                                            <button onClick={() => handleUpdateStatus(p.id, 'none')} className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${(!p.recoveryStatus || p.recoveryStatus === 'none') ? 'bg-gray-700 text-white' : 'bg-transparent text-gray-600 border-gray-800'}`}>Novo</button>
                                            <button onClick={() => handleUpdateStatus(p.id, 'contacted')} className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${p.recoveryStatus === 'contacted' ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-600 border-gray-800'}`}>Aberto</button>
                                            <button onClick={() => handleUpdateStatus(p.id, 'no_response')} className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${p.recoveryStatus === 'no_response' ? 'bg-orange-600 text-white' : 'bg-transparent text-gray-600 border-gray-800'}`}>Vácuo</button>
                                            <button onClick={() => handleUpdateStatus(p.id, 'purchased')} className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${p.recoveryStatus === 'purchased' ? 'bg-green-600 text-white' : 'bg-transparent text-gray-600 border-gray-800'}`}>VENDA</button>
                                        </div>
                                    </td>
                                    <td className="px-6 py-5 text-center">
                                        {p.recoveryAdminEmail ? (
                                            <p className="text-[9px] text-primary font-black uppercase truncate max-w-[80px] mx-auto">{p.recoveryAdminEmail.split('@')[0]}</p>
                                        ) : (
                                            <span className="text-gray-700 text-[9px] font-bold uppercase">Livre</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-5 text-right">
                                        <button 
                                            onClick={() => handleStartWhatsApp(p)}
                                            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-[9px] font-black uppercase hover:bg-green-500 shadow-lg shadow-green-900/20 active:scale-95 transition-all"
                                        >
                                            <WhatsAppIcon className="w-4 h-4" /> INICIAR
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default RecoveryDashboard;
