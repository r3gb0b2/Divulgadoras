
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { 
    getAllParticipantsForAdmin, 
    toggleParticipantBan, 
    adminCreateFollowInteraction, 
    getAllFollowInteractions, 
    updateParticipantInstagram,
    getFollowLoops,
    createFollowLoop,
    deleteFollowLoop,
    updateFollowLoop
} from '../services/followLoopService';
import { getStatsForPromoter } from '../services/postService';
import { getOrganization, updateOrganization } from '../services/organizationService';
import { FollowLoopParticipant, FollowInteraction, FollowLoop } from '../types';
import { ArrowLeftIcon, SearchIcon, InstagramIcon, UserPlusIcon, CogIcon, RefreshIcon, PencilIcon, LinkIcon, HeartIcon, PlusIcon, TrashIcon } from '../components/Icons';
import { Timestamp } from 'firebase/firestore';

// FIX: Ensure ParticipantWithStats explicitly extends FollowLoopParticipant.
interface ParticipantWithStats extends FollowLoopParticipant {
    taskCompletionRate: number;
}

const formatDate = (timestamp: any): string => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const AdminFollowLoopPage: React.FC = () => {
    const navigate = useNavigate();
    const { selectedOrgId } = useAdminAuth();
    
    // View State
    const [viewMode, setViewMode] = useState<'list' | 'details'>('list');
    const [selectedLoop, setSelectedLoop] = useState<FollowLoop | null>(null);

    // Loop List State
    const [loops, setLoops] = useState<FollowLoop[]>([]);
    const [isCreatingLoop, setIsCreatingLoop] = useState(false);
    const [newLoopName, setNewLoopName] = useState('');
    const [newLoopDesc, setNewLoopDesc] = useState('');

    // Detail View State
    const [activeTab, setActiveTab] = useState<'participants' | 'history'>('participants');
    const [participants, setParticipants] = useState<ParticipantWithStats[]>([]);
    const [interactions, setInteractions] = useState<FollowInteraction[]>([]);
    
    // General State
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [filterType, setFilterType] = useState<'all' | 'active' | 'banned' | 'high_rejection'>('all');
    
    // Threshold Config
    const [threshold, setThreshold] = useState<number>(0);
    const [isSavingThreshold, setIsSavingThreshold] = useState(false);
    
    // Manual Connection Modal
    const [isManualModalOpen, setIsManualModalOpen] = useState(false);
    const [manualFollower, setManualFollower] = useState('');
    const [manualFollowed, setManualFollowed] = useState('');
    const [isManualProcessing, setIsManualProcessing] = useState(false);
    
    const [copiedLink, setCopiedLink] = useState<string | null>(null);

    useEffect(() => {
        if(selectedOrgId) {
            fetchLoops();
        }
    }, [selectedOrgId]);

    const fetchLoops = async () => {
        if (!selectedOrgId) return;
        setIsLoading(true);
        try {
            const data = await getFollowLoops(selectedOrgId);
            setLoops(data.sort((a, b) => (b.createdAt as Timestamp)?.toMillis() - (a.createdAt as Timestamp)?.toMillis()));
            
            // Also fetch org config for threshold
            const orgData = await getOrganization(selectedOrgId);
            if (orgData) setThreshold(orgData.followLoopThreshold || 0);

        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateLoop = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedOrgId || !newLoopName.trim()) return;
        setIsCreatingLoop(true);
        try {
            await createFollowLoop({
                name: newLoopName,
                description: newLoopDesc,
                organizationId: selectedOrgId,
                isActive: true
            });
            setNewLoopName('');
            setNewLoopDesc('');
            await fetchLoops();
            alert("Conexão criada com sucesso!");
        } catch (err: any) {
            alert(err.message);
        } finally {
            setIsCreatingLoop(false);
        }
    };

    const handleDeleteLoop = async (loop: FollowLoop) => {
        if (!window.confirm(`Tem certeza que deseja apagar a conexão "${loop.name}"? Isso não apaga o histórico de quem seguiu quem, mas remove o acesso.`)) return;
        try {
            await deleteFollowLoop(loop.id);
            await fetchLoops();
        } catch (err: any) {
            alert(err.message);
        }
    };
    
    const handleToggleLoopActive = async (loop: FollowLoop) => {
        try {
            await updateFollowLoop(loop.id, { isActive: !loop.isActive });
            setLoops(prev => prev.map(l => l.id === loop.id ? { ...l, isActive: !l.isActive } : l));
        } catch (err: any) {
            alert(err.message);
        }
    };

    const handleOpenLoop = async (loop: FollowLoop) => {
        setSelectedLoop(loop);
        setViewMode('details');
        fetchLoopDetails(loop.id);
    };

    const fetchLoopDetails = useCallback(async (loopId: string) => {
        if (!selectedOrgId) return;
        setIsLoading(true);
        setError('');
        
        // Reset state
        setParticipants([]);
        setInteractions([]);

        try {
            // Parallel fetch
            const [loopParticipants, loopInteractions] = await Promise.all([
                getAllParticipantsForAdmin(selectedOrgId, loopId),
                getAllFollowInteractions(selectedOrgId, loopId)
            ]);
            
            // Enrich participants with stats
            const enriched = await Promise.all(loopParticipants.map(async (p) => {
                try {
                    const { stats } = await getStatsForPromoter(p.promoterId);
                    const successful = stats.completed + stats.acceptedJustifications;
                    const rate = stats.assigned > 0 ? Math.round((successful / stats.assigned) * 100) : -1;
                    return { ...p, taskCompletionRate: rate } as ParticipantWithStats;
                } catch (e) {
                    return { ...p, taskCompletionRate: -1 } as ParticipantWithStats;
                }
            }));

            setParticipants(enriched);
            setInteractions(loopInteractions || []);

        } catch (err: any) {
            console.error(err);
            setError(err.message || "Erro ao carregar detalhes.");
        } finally {
            setIsLoading(false);
        }
    }, [selectedOrgId]);

    const handleSaveThreshold = async () => {
        if (!selectedOrgId) return;
        setIsSavingThreshold(true);
        try {
            await updateOrganization(selectedOrgId, { followLoopThreshold: threshold });
            alert('Critério de elegibilidade atualizado com sucesso!');
        } catch (err: any) {
            alert('Erro ao salvar: ' + err.message);
        } finally {
            setIsSavingThreshold(false);
        }
    };

    const handleToggleBan = async (p: ParticipantWithStats) => {
        const action = p.isBanned ? 'remover o banimento de' : 'banir';
        if (!window.confirm(`Tem certeza que deseja ${action} ${p.promoterName}?`)) return;
        
        setProcessingId(p.id);
        try {
            await toggleParticipantBan(p.id, !p.isBanned);
            setParticipants(prev => prev.map(item => 
                item.id === p.id ? { ...item, isBanned: !p.isBanned, isActive: !p.isBanned } : item
            ));
        } catch (err: any) {
            alert(err.message);
        } finally {
            setProcessingId(null);
        }
    };

    const handleEditInstagram = async (participant: ParticipantWithStats) => {
        const newInstagram = window.prompt("Editar Instagram (Conexões):", participant.instagram);
        if (newInstagram !== null && newInstagram.trim() !== participant.instagram) {
            try {
                await updateParticipantInstagram(participant.id, newInstagram.trim());
                setParticipants(prev => prev.map(p => p.id === participant.id ? { ...p, instagram: newInstagram.trim() } : p));
                alert("Instagram atualizado na lista de conexões.");
            } catch (e: any) {
                alert(e.message);
            }
        }
    };

    const handleManualAssignment = async () => {
        if (!manualFollower || !manualFollowed) {
            alert("Selecione as duas divulgadoras.");
            return;
        }
        if (manualFollower === manualFollowed) {
            alert("Não pode ser a mesma pessoa.");
            return;
        }
        if (!selectedLoop) return;

        setIsManualProcessing(true);
        try {
            await adminCreateFollowInteraction(manualFollower, manualFollowed, selectedLoop.id);
            alert("Conexão criada com sucesso! Contadores atualizados.");
            setIsManualModalOpen(false);
            setManualFollower('');
            setManualFollowed('');
            fetchLoopDetails(selectedLoop.id); 
        } catch (err: any) {
            alert(err.message);
        } finally {
            setIsManualProcessing(false);
        }
    };
    
    const handleCopyLink = (loopId: string) => {
        const link = `${window.location.origin}/#/connect/${loopId}`;
        navigator.clipboard.writeText(link).then(() => {
            setCopiedLink(loopId);
            setTimeout(() => setCopiedLink(null), 2500);
        });
    };

    const filteredParticipants = useMemo(() => {
        let result = participants;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(p => p.promoterName.toLowerCase().includes(q) || p.instagram.toLowerCase().includes(q));
        }
        if (filterType === 'active') result = result.filter(p => p.isActive && !p.isBanned);
        if (filterType === 'banned') result = result.filter(p => p.isBanned);
        if (filterType === 'high_rejection') result = result.filter(p => (p.rejectedCount || 0) > 2);
        result.sort((a, b) => (b.rejectedCount || 0) - (a.rejectedCount || 0));
        return result;
    }, [participants, searchQuery, filterType]);
    
    const filteredHistory = useMemo(() => {
        let result = interactions;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(i => i.followerName.toLowerCase().includes(q) || i.followedName.toLowerCase().includes(q));
        }
        return result;
    }, [interactions, searchQuery]);

    const getPerformanceColor = (rate: number) => {
        if (rate < 0) return 'text-gray-400';
        if (rate === 100) return 'text-green-400';
        if (rate >= 60) return 'text-blue-400';
        return 'text-red-400';
    };
    
    const getInteractionStatusBadge = (status: FollowInteraction['status']) => {
        const styles = { validated: "bg-green-900/50 text-green-300", pending_validation: "bg-yellow-900/50 text-yellow-300", rejected: "bg-red-900/50 text-red-300", unfollowed: "bg-gray-700 text-gray-300 border border-red-500/50" };
        const labels = { validated: "Confirmado", pending_validation: "Pendente", rejected: "Não Seguiu", unfollowed: "Deixou de Seguir" };
        const s = status as keyof typeof styles;
        return <span className={`px-2 py-1 rounded text-xs font-bold whitespace-nowrap ${styles[s] || styles.pending_validation}`}>{labels[s] || status}</span>;
    };

    const activeParticipantsForSelect = useMemo(() => {
        return participants.filter(p => !p.isBanned).sort((a, b) => a.promoterName.localeCompare(b.promoterName));
    }, [participants]);

    if (viewMode === 'list') {
        return (
            <div>
                 <div className="flex justify-between items-center mb-6">
                    <h1 className="text-3xl font-bold">Conexão Divulgadoras</h1>
                    <button onClick={() => navigate('/admin/settings')} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm"><ArrowLeftIcon className="w-4 h-4" /><span>Voltar</span></button>
                </div>

                {/* Eligibility Config */}
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-8">
                    <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><CogIcon className="w-6 h-6 text-primary" />Configurar Elegibilidade (Global)</h2>
                    <div className="flex flex-col sm:flex-row items-center gap-6">
                        <div className="flex-grow w-full">
                            <p className="text-gray-300 text-sm mb-2">Taxa mínima de aproveitamento em tarefas para participar de qualquer conexão.</p>
                            <div className="flex items-center gap-4">
                                <input type="range" min="0" max="100" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="flex-grow h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-primary"/>
                                <span className="text-2xl font-bold text-primary w-16 text-right">{threshold}%</span>
                            </div>
                        </div>
                        <button onClick={handleSaveThreshold} disabled={isSavingThreshold} className="px-6 py-2 bg-primary text-white font-bold rounded-md hover:bg-primary-dark disabled:opacity-50 flex-shrink-0">{isSavingThreshold ? 'Salvando...' : 'Salvar Regra'}</button>
                    </div>
                </div>

                {/* Create Loop */}
                <div className="bg-secondary shadow-lg rounded-lg p-6 mb-8">
                    <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><PlusIcon className="w-6 h-6 text-green-400"/> Criar Nova Conexão</h2>
                    <form onSubmit={handleCreateLoop} className="flex flex-col md:flex-row gap-4">
                         <input 
                            type="text" 
                            placeholder="Nome da Conexão (ex: Conexão VIP, Evento X)" 
                            value={newLoopName} 
                            onChange={(e) => setNewLoopName(e.target.value)} 
                            className="flex-grow px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white focus:ring-primary focus:border-primary"
                            required
                        />
                        <input 
                            type="text" 
                            placeholder="Descrição curta (opcional)" 
                            value={newLoopDesc} 
                            onChange={(e) => setNewLoopDesc(e.target.value)} 
                            className="flex-grow px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white focus:ring-primary focus:border-primary"
                        />
                        <button type="submit" disabled={isCreatingLoop} className="px-6 py-2 bg-green-600 text-white font-bold rounded-md hover:bg-green-700 disabled:opacity-50">
                            {isCreatingLoop ? 'Criando...' : 'Criar'}
                        </button>
                    </form>
                </div>

                {/* Loops List */}
                <h2 className="text-2xl font-bold text-white mb-4">Minhas Conexões Ativas</h2>
                {isLoading ? <p className="text-center text-gray-400">Carregando...</p> : loops.length === 0 ? <p className="text-center text-gray-500 py-10">Nenhuma conexão criada ainda.</p> : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {loops.map(loop => (
                            <div key={loop.id} className="bg-gray-800 border border-gray-700 rounded-lg p-6 flex flex-col justify-between hover:border-gray-500 transition-colors">
                                <div>
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="text-xl font-bold text-white">{loop.name}</h3>
                                        <div className="flex items-center space-x-2">
                                            <button 
                                                onClick={() => handleToggleLoopActive(loop)}
                                                className={`w-3 h-3 rounded-full ${loop.isActive ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'} transition-all`}
                                                title={loop.isActive ? 'Ativo' : 'Inativo'}
                                            />
                                        </div>
                                    </div>
                                    <p className="text-sm text-gray-400 mb-4">{loop.description || 'Sem descrição'}</p>
                                </div>
                                <div className="space-y-3">
                                    <button 
                                        onClick={() => handleOpenLoop(loop)} 
                                        className="w-full py-2 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark transition-colors flex items-center justify-center gap-2"
                                    >
                                        <HeartIcon className="w-5 h-5"/> Gerenciar
                                    </button>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => handleCopyLink(loop.id)} 
                                            className="flex-1 py-2 bg-gray-700 text-gray-300 text-sm rounded-md hover:bg-gray-600 flex items-center justify-center gap-1"
                                        >
                                            {copiedLink === loop.id ? 'Copiado!' : <><LinkIcon className="w-4 h-4"/> Copiar Link</>}
                                        </button>
                                        <button 
                                            onClick={() => handleDeleteLoop(loop)} 
                                            className="px-3 py-2 bg-red-900/30 text-red-400 rounded-md hover:bg-red-900/50 border border-red-900"
                                            title="Excluir Conexão"
                                        >
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold">{selectedLoop?.name}</h1>
                    <p className="text-gray-400 text-sm">Gerenciamento da Conexão</p>
                </div>
                <button onClick={() => { setViewMode('list'); setSelectedLoop(null); }} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm"><ArrowLeftIcon className="w-4 h-4" /><span>Voltar para Lista</span></button>
            </div>

            <div className="bg-secondary shadow-lg rounded-lg p-6">
                <div className="flex border-b border-gray-700 mb-6">
                    <button className={`py-2 px-4 font-medium ${activeTab === 'participants' ? 'text-primary border-b-2 border-primary' : 'text-gray-400 hover:text-gray-200'}`} onClick={() => setActiveTab('participants')}>Participantes</button>
                    <button className={`py-2 px-4 font-medium ${activeTab === 'history' ? 'text-primary border-b-2 border-primary' : 'text-gray-400 hover:text-gray-200'}`} onClick={() => setActiveTab('history')}>Histórico de Interações</button>
                </div>

                <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4">
                    <div className="relative flex-grow w-full md:w-auto">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3"><SearchIcon className="h-5 w-5 text-gray-400" /></span>
                        <input type="text" placeholder={activeTab === 'participants' ? "Buscar participante..." : "Buscar na histórico..."} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" />
                    </div>
                    {activeTab === 'participants' && (
                        <div className="flex gap-2 overflow-x-auto pb-2">
                            <button onClick={() => setFilterType('all')} className={`px-3 py-2 text-sm rounded-md whitespace-nowrap ${filterType === 'all' ? 'bg-primary' : 'bg-gray-700'}`}>Todos</button>
                            <button onClick={() => setFilterType('active')} className={`px-3 py-2 text-sm rounded-md whitespace-nowrap ${filterType === 'active' ? 'bg-primary' : 'bg-gray-700'}`}>Ativos</button>
                            <button onClick={() => setFilterType('high_rejection')} className={`px-3 py-2 text-sm rounded-md whitespace-nowrap ${filterType === 'high_rejection' ? 'bg-primary' : 'bg-gray-700'}`}>Alertas</button>
                            <button onClick={() => setFilterType('banned')} className={`px-3 py-2 text-sm rounded-md whitespace-nowrap ${filterType === 'banned' ? 'bg-primary' : 'bg-gray-700'}`}>Banidos</button>
                        </div>
                    )}
                    <button onClick={() => setIsManualModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex-shrink-0 text-sm"><UserPlusIcon className="w-4 h-4" />Criar Conexão Manual</button>
                    <button onClick={() => selectedLoop && fetchLoopDetails(selectedLoop.id)} className="p-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 flex-shrink-0" title="Atualizar"><RefreshIcon className="w-5 h-5" /></button>
                </div>

                {isLoading ? <p className="text-center py-8">Carregando...</p> : (
                    <div className="overflow-x-auto">
                        {activeTab === 'participants' ? (
                            <table className="min-w-full divide-y divide-gray-700">
                                <thead className="bg-gray-700/50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Participante</th>
                                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-300 uppercase">Seguiu (Diz)</th>
                                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-300 uppercase">Ganhou</th>
                                        <th className="px-4 py-3 text-center text-xs font-medium text-red-400 uppercase" title="Vezes que alguém disse que ela NÃO seguiu">Negativas</th>
                                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-300 uppercase">Taxa Tarefas</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                    {filteredParticipants.map(p => (
                                        <tr key={p.id} className={`hover:bg-gray-700/40 ${p.isBanned ? 'opacity-50' : ''}`}>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <div className="flex items-center">
                                                    <img src={p.photoUrl || 'https://via.placeholder.com/40'} alt="" className="w-10 h-10 rounded-full object-cover mr-3 border border-gray-600"/>
                                                    <div>
                                                        <div className="font-medium text-white">{p.promoterName}</div>
                                                        <div className="text-xs text-gray-400 flex items-center gap-1"><InstagramIcon className="w-3 h-3"/> {p.instagram}<button onClick={() => handleEditInstagram(p)} className="ml-1 text-gray-500 hover:text-white" title="Editar Instagram"><PencilIcon className="w-3 h-3" /></button></div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-center text-sm text-gray-300">{p.followingCount}</td>
                                            <td className="px-4 py-3 text-center text-sm text-gray-300">{p.followersCount}</td>
                                            <td className="px-4 py-3 text-center">{(p.rejectedCount || 0) > 0 ? <span className="px-2 py-1 rounded-full bg-red-900/50 text-red-300 font-bold text-xs">{p.rejectedCount}</span> : <span className="text-gray-500">-</span>}</td>
                                            <td className="px-4 py-3 text-center font-bold text-sm"><span className={getPerformanceColor(p.taskCompletionRate)}>{p.taskCompletionRate >= 0 ? `${p.taskCompletionRate}%` : 'N/A'}</span></td>
                                            <td className="px-4 py-3 text-right">
                                                <button onClick={() => handleToggleBan(p)} disabled={processingId === p.id} className={`px-3 py-1 rounded-md text-xs font-semibold ${p.isBanned ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>{processingId === p.id ? '...' : (p.isBanned ? 'Desbanir' : 'Banir')}</button>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredParticipants.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-gray-400">Nenhum participante encontrado neste grupo.</td></tr>}
                                </tbody>
                            </table>
                        ) : (
                            <table className="min-w-full divide-y divide-gray-700">
                                <thead className="bg-gray-700/50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Data</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Seguidora (Quem fez)</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Alvo (Quem recebeu)</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                    {filteredHistory.map(interaction => (
                                        <tr key={interaction.id} className="hover:bg-gray-700/40">
                                            <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-400">{formatDate(interaction.createdAt)}</td>
                                            <td className="px-4 py-3 whitespace-nowrap"><div className="font-medium text-white text-sm">{interaction.followerName}</div><div className="text-xs text-gray-500">{interaction.followerInstagram}</div></td>
                                            <td className="px-4 py-3 whitespace-nowrap"><div className="font-medium text-white text-sm">{interaction.followedName}</div><div className="text-xs text-gray-500">{interaction.followedInstagram}</div></td>
                                            <td className="px-4 py-3 whitespace-nowrap text-right">{getInteractionStatusBadge(interaction.status)}</td>
                                        </tr>
                                    ))}
                                    {filteredHistory.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-gray-400">Nenhum registro encontrado.</td></tr>}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}
            </div>

            {isManualModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
                    <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-md">
                        <h2 className="text-xl font-bold text-white mb-4">Atribuir Conexão Manual ({selectedLoop?.name})</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm text-gray-300 mb-1">Quem Seguiu (Seguidora)</label>
                                <select value={manualFollower} onChange={e => setManualFollower(e.target.value)} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white">
                                    <option value="">Selecione...</option>
                                    {activeParticipantsForSelect.map(p => <option key={p.id} value={p.id}>{p.promoterName}</option>)}
                                </select>
                            </div>
                            <div className="flex justify-center"><ArrowLeftIcon className="w-6 h-6 text-gray-500 transform -rotate-90" /></div>
                            <div>
                                <label className="block text-sm text-gray-300 mb-1">Quem foi Seguida (Alvo)</label>
                                <select value={manualFollowed} onChange={e => setManualFollowed(e.target.value)} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white">
                                    <option value="">Selecione...</option>
                                    {activeParticipantsForSelect.map(p => <option key={p.id} value={p.id}>{p.promoterName}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setIsManualModalOpen(false)} className="px-4 py-2 bg-gray-600 rounded-md text-white hover:bg-gray-500">Cancelar</button>
                            <button onClick={handleManualAssignment} disabled={isManualProcessing} className="px-4 py-2 bg-green-600 rounded-md text-white hover:bg-green-700 disabled:opacity-50">{isManualProcessing ? 'Salvando...' : 'Confirmar Conexão'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminFollowLoopPage;
