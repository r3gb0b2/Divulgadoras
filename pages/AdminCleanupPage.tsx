
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BuildingOfficeIcon, TrashIcon, ArrowLeftIcon, ClockIcon } from '../components/Icons';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { cleanupOldProofs, analyzeCampaignProofs, deleteCampaignProofs, getPostsForOrg } from '../services/postService';
import { getAllCampaigns } from '../services/settingsService';
import { getOrganizations } from '../services/organizationService';
import { Campaign, Post, Organization, Timestamp } from '../types';

const AdminCleanupPage: React.FC = () => {
    const navigate = useNavigate();
    const { selectedOrgId } = useAdminAuth();
    
    // Org Selection
    const [allOrgs, setAllOrgs] = useState<Organization[]>([]);
    const [targetOrgId, setTargetOrgId] = useState<string>('');

    // State for Campaign Specific Cleanup
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [posts, setPosts] = useState<Post[]>([]);
    const [selectedCampaignName, setSelectedCampaignName] = useState('');
    const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(new Set());
    
    const [isLoadingData, setIsLoadingData] = useState(false);
    const [isCleaning, setIsCleaning] = useState(false);
    
    // State for Progress Bar
    const [analysisResult, setAnalysisResult] = useState<{ count: number, formattedSize: string } | null>(null);
    const [deletionProgress, setDeletionProgress] = useState<{ current: number, total: number }>({ current: 0, total: 0 });
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isDeletingSpecific, setIsDeletingSpecific] = useState(false);

    // Load Organizations
    useEffect(() => {
        getOrganizations().then(orgs => {
            const sorted = orgs.sort((a,b) => a.name.localeCompare(b.name));
            setAllOrgs(sorted);
            if (selectedOrgId) {
                setTargetOrgId(selectedOrgId);
            } else if (sorted.length > 0) {
                setTargetOrgId(sorted[0].id);
            }
        }).catch(console.error);
    }, [selectedOrgId]);

    // Load Campaigns and Posts when Org changes
    useEffect(() => {
        if (targetOrgId) {
            setIsLoadingData(true);
            Promise.all([
                getAllCampaigns(targetOrgId),
                getPostsForOrg(targetOrgId)
            ]).then(([campaignsData, postsData]) => {
                setCampaigns(campaignsData);
                setPosts(postsData);
            }).catch(console.error)
              .finally(() => setIsLoadingData(false));

            setSelectedCampaignName('');
            setSelectedPostIds(new Set());
            setAnalysisResult(null);
            setDeletionProgress({ current: 0, total: 0 });
        } else {
            setCampaigns([]);
            setPosts([]);
        }
    }, [targetOrgId]);

    const filteredPosts = posts.filter(p => !selectedCampaignName || p.campaignName === selectedCampaignName);

    const handleTogglePost = (postId: string) => {
        setSelectedPostIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(postId)) newSet.delete(postId);
            else newSet.add(postId);
            return newSet;
        });
        setAnalysisResult(null);
    };

    const handleSelectAllPosts = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            const allIds = filteredPosts.map(p => p.id);
            setSelectedPostIds(new Set(allIds));
        } else {
            setSelectedPostIds(new Set());
        }
        setAnalysisResult(null);
    };

    const handleCleanup = async () => {
        if (!targetOrgId) {
            alert("Selecione uma organização para executar a limpeza.");
            return;
        }
        
        const confirmMessage = "Tem certeza que deseja apagar PERMANENTEMENTE todas as imagens de comprovação de eventos marcados como 'Inativos' da organização selecionada?\n\nIsso liberará espaço no banco de dados. As imagens serão substituídas por um aviso visual.\n\nEsta ação não pode ser desfeita.";
        
        if (window.confirm(confirmMessage)) {
            setIsCleaning(true);
            try {
                const result = await cleanupOldProofs(targetOrgId);
                alert(result.message);
            } catch (err: any) {
                alert(err.message);
            } finally {
                setIsCleaning(false);
            }
        }
    };
    
    const handleAnalyze = async () => {
        if (!targetOrgId) return;
        const idsToAnalyze: string[] = Array.from(selectedPostIds);
        
        if (idsToAnalyze.length === 0 && !selectedCampaignName) {
            alert("Selecione um evento ou marque postagens específicas.");
            return;
        }

        setIsAnalyzing(true);
        setAnalysisResult(null);
        setDeletionProgress({ current: 0, total: 0 });

        try {
            let totalCount = 0;
            let totalSizeBytes = 0;

            if (idsToAnalyze.length > 0) {
                for (const postId of idsToAnalyze) {
                    const result = await analyzeCampaignProofs(targetOrgId, undefined, postId as string);
                    totalCount += result.count;
                    if ((result as any).sizeBytes) {
                        totalSizeBytes += (result as any).sizeBytes;
                    }
                }
            } else {
                const result = await analyzeCampaignProofs(targetOrgId, selectedCampaignName, undefined);
                totalCount = result.count;
                if ((result as any).sizeBytes) {
                    totalSizeBytes = (result as any).sizeBytes;
                }
            }

            const formattedSize = (totalSizeBytes / (1024 * 1024)).toFixed(2) + ' MB';
            setAnalysisResult({ count: totalCount, formattedSize });

        } catch (err: any) {
            alert(err.message);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleDeleteLoop = async () => {
        if (!targetOrgId || !analysisResult || analysisResult.count === 0) return;
        
        const idsToDelete: string[] = Array.from(selectedPostIds);
        const mode = idsToDelete.length > 0 ? 'specific' : 'campaign';
        
        const targetName = mode === 'specific'
            ? `${idsToDelete.length} postagens selecionadas`
            : `o evento "${selectedCampaignName}" (todos os posts)`;

        if (!window.confirm(`ATENÇÃO: Você está prestes a apagar ${analysisResult.count} arquivos de imagem para ${targetName}.\n\nIsso liberará cerca de ${analysisResult.formattedSize}.\n\nEsta ação é irreversível. Deseja continuar?`)) return;

        setIsDeletingSpecific(true);
        let deletedTotal = 0;
        const totalToDelete = analysisResult.count;
        
        setDeletionProgress({ current: 0, total: totalToDelete });

        try {
            if (mode === 'specific') {
                for (const postId of idsToDelete) {
                    let hasMore = true;
                    while (hasMore) {
                        const result = await deleteCampaignProofs(targetOrgId, undefined, postId as string);
                        deletedTotal += result.updatedDocs;
                        setDeletionProgress({ current: deletedTotal, total: totalToDelete });
                        hasMore = result.hasMore;
                        if (result.updatedDocs === 0) hasMore = false;
                    }
                }
            } else {
                let hasMore = true;
                while (hasMore) {
                    const result = await deleteCampaignProofs(targetOrgId, selectedCampaignName, undefined);
                    deletedTotal += result.updatedDocs;
                    setDeletionProgress({ current: deletedTotal, total: totalToDelete });
                    hasMore = result.hasMore;
                    if (result.updatedDocs === 0) hasMore = false;
                }
            }

            alert(`Processo concluído! ${deletedTotal} arquivos foram apagados.`);
            setAnalysisResult(null); 
            setDeletionProgress({ current: 0, total: 0 });

        } catch (err: any) {
            console.error(err);
            alert(`Ocorreu um erro durante a exclusão: ${err.message}. Alguns arquivos podem ter sido apagados.`);
        } finally {
            setIsDeletingSpecific(false);
        }
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <TrashIcon className="w-8 h-8 text-red-500" />
                    Manutenção de Armazenamento
                </h1>
                <button onClick={() => navigate('/admin')} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                    <ArrowLeftIcon className="w-4 h-4" />
                    <span>Voltar</span>
                </button>
            </div>

            <div className="mb-6 bg-gray-800 p-4 rounded-lg flex flex-col sm:flex-row items-center gap-4">
                <BuildingOfficeIcon className="w-6 h-6 text-gray-400 hidden sm:block" />
                <div className="flex-grow w-full">
                    <label className="block text-xs font-semibold text-gray-400 mb-1">ORGANIZAÇÃO ALVO</label>
                    <select 
                        value={targetOrgId} 
                        onChange={(e) => setTargetOrgId(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white text-sm focus:ring-primary focus:border-primary"
                    >
                        <option value="">Selecione uma organização...</option>
                        {allOrgs.map(org => (
                            <option key={org.id} value={org.id}>{org.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {/* General Cleanup Card */}
                <div className={`bg-red-900/30 border border-red-800 rounded-lg p-6 ${!targetOrgId ? 'opacity-50 pointer-events-none' : ''}`}>
                    <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                        <ClockIcon className="w-6 h-6 text-red-400" />
                        Limpeza Geral (Inativos)
                    </h2>
                    <p className="text-gray-300 text-sm mb-4">
                        Limpar prints de TODOS os eventos marcados como 'Inativos'. Ideal para faxina geral.
                    </p>
                    <button 
                        onClick={handleCleanup} 
                        disabled={isCleaning || !targetOrgId}
                        className="w-full px-4 py-3 bg-red-700 hover:bg-red-600 text-white font-semibold rounded-md disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isCleaning ? 'Limpando...' : 'Executar Limpeza Geral'}
                    </button>
                </div>

                {/* Specific Cleanup Card */}
                <div className={`bg-orange-900/30 border border-orange-800 rounded-lg p-6 ${!targetOrgId ? 'opacity-50 pointer-events-none' : ''}`}>
                    <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                        <TrashIcon className="w-6 h-6 text-orange-400" />
                        Limpeza Específica
                    </h2>
                    <p className="text-gray-300 text-sm mb-4">
                        Selecione um evento e marque as postagens que deseja limpar.
                    </p>
                    <div className="flex flex-col gap-3">
                        <select 
                            value={selectedCampaignName} 
                            onChange={(e) => {
                                setSelectedCampaignName(e.target.value);
                                setSelectedPostIds(new Set()); 
                                setAnalysisResult(null); 
                            }}
                            className="bg-gray-800 border border-gray-600 rounded p-2 text-white text-sm"
                            disabled={!targetOrgId || isAnalyzing || isDeletingSpecific}
                        >
                            <option value="">Selecione o Evento ({campaigns.length})</option>
                            {campaigns.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </select>

                        {/* Checkbox List */}
                        <div className="bg-gray-800 border border-gray-600 rounded p-2 text-white text-sm max-h-60 overflow-y-auto">
                            {filteredPosts.length === 0 ? (
                                <p className="text-gray-500 text-center py-2">{selectedCampaignName ? 'Nenhum post encontrado para este evento.' : 'Selecione um evento acima.'}</p>
                            ) : (
                                <div>
                                    <label className="flex items-center space-x-2 p-2 border-b border-gray-700 mb-2 cursor-pointer sticky top-0 bg-gray-800 z-10">
                                        <input 
                                            type="checkbox"
                                            onChange={handleSelectAllPosts}
                                            checked={selectedPostIds.size === filteredPosts.length && filteredPosts.length > 0}
                                            className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-primary focus:ring-primary"
                                        />
                                        <span className="font-bold text-white">Selecionar Todos ({filteredPosts.length})</span>
                                    </label>
                                    <div className="space-y-1">
                                        {filteredPosts.map(p => (
                                            <label key={p.id} className="flex items-center space-x-2 p-2 hover:bg-gray-700/50 rounded cursor-pointer">
                                                <input 
                                                    type="checkbox"
                                                    checked={selectedPostIds.has(p.id)}
                                                    onChange={() => handleTogglePost(p.id)}
                                                    className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-primary focus:ring-primary"
                                                />
                                                <div className="flex flex-col">
                                                    <span className="font-semibold text-gray-200">
                                                        {p.type.toUpperCase()} - {p.instructions?.substring(0, 30)}...
                                                    </span>
                                                    <div className="flex gap-2 text-xs">
                                                        <span className={p.isActive ? 'text-green-400' : 'text-red-400'}>
                                                            {p.isActive ? 'Ativo' : 'Inativo'}
                                                        </span>
                                                        <span className="text-gray-500">
                                                            {((p.createdAt as Timestamp)?.toDate().toLocaleDateString('pt-BR'))}
                                                        </span>
                                                    </div>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        <div className="flex gap-2">
                            <button 
                                onClick={handleAnalyze} 
                                disabled={isAnalyzing || isDeletingSpecific || (!selectedCampaignName && selectedPostIds.size === 0)}
                                className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-md disabled:opacity-50 text-sm"
                            >
                                {isAnalyzing ? 'Analisando...' : `Analisar (${selectedPostIds.size > 0 ? selectedPostIds.size : 'Todos'})`}
                            </button>
                            <button 
                                onClick={handleDeleteLoop} 
                                disabled={isDeletingSpecific || !analysisResult}
                                className="flex-1 px-3 py-2 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-md disabled:opacity-50 text-sm"
                            >
                                {isDeletingSpecific ? 'Apagando...' : 'Limpar Arquivos'}
                            </button>
                        </div>
                        
                        {isDeletingSpecific && (
                            <div className="mt-2">
                                <div className="w-full bg-gray-700 rounded-full h-2.5 dark:bg-gray-700 mb-1">
                                    <div 
                                        className="bg-red-600 h-2.5 rounded-full transition-all duration-300" 
                                        style={{ width: `${Math.min(100, Math.round((deletionProgress.current / (deletionProgress.total || 1)) * 100))}%` }}
                                    ></div>
                                </div>
                                <p className="text-xs text-center text-gray-300">
                                    Apagando: {deletionProgress.current} / {deletionProgress.total}
                                </p>
                            </div>
                        )}
                        
                        {analysisResult && !isDeletingSpecific && (
                            <div className="mt-2 text-sm bg-black/40 p-2 rounded text-orange-200">
                                <p><strong>Arquivos:</strong> {analysisResult.count}</p>
                                <p><strong>Espaço:</strong> {analysisResult.formattedSize}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminCleanupPage;
