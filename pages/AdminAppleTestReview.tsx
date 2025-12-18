
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getAppleTestRegistrants, deleteAppleTestRegistrant } from '../services/testRegistrationService';
import { AppleTestRegistrant } from '../types';
import { ArrowLeftIcon, DownloadIcon, TrashIcon, LinkIcon } from '../components/Icons';

const AdminAppleTestReview: React.FC = () => {
    const navigate = useNavigate();
    const { selectedOrgId, adminData } = useAdminAuth();
    const [registrants, setRegistrants] = useState<AppleTestRegistrant[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const data = await getAppleTestRegistrants(selectedOrgId || undefined);
            setRegistrants(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [selectedOrgId]);

    const handleCopyLink = () => {
        // Agora copia o link "único" sem precisar do ID da organização na URL
        const link = `${window.location.origin}/#/apple-test`;
        navigator.clipboard.writeText(link).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(new Set(registrants.map(r => r.id)));
        } else {
            setSelectedIds(new Set());
        }
    };

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("Remover este inscrito?")) return;
        try {
            await deleteAppleTestRegistrant(id);
            setRegistrants(prev => prev.filter(r => r.id !== id));
            setSelectedIds(prev => {
                const n = new Set(prev);
                n.delete(id);
                return n;
            });
        } catch (err: any) {
            alert(err.message);
        }
    };

    const handleDownloadCSV = () => {
        const targetList = registrants.filter(r => selectedIds.has(r.id));
        if (targetList.length === 0) {
            alert("Selecione pelo menos uma pessoa.");
            return;
        }

        const headers = ["First Name", "Last Name", "Email"];
        const rows = targetList.map(r => `"${r.firstName}","${r.lastName}","${r.email}"`);
        const csvContent = [headers.join(','), ...rows].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `apple_testers_${new Date().getTime()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="p-4 max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <button onClick={() => navigate('/admin')} className="inline-flex items-center gap-2 text-primary hover:underline text-sm mb-2">
                        <ArrowLeftIcon className="w-4 h-4" /> Voltar ao Painel
                    </button>
                    <h1 className="text-3xl font-bold text-white">Inscritos para Teste iOS</h1>
                </div>
                <div className="flex gap-3">
                    <button 
                        onClick={handleCopyLink}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-semibold"
                    >
                        <LinkIcon className="w-4 h-4" /> {copied ? 'Copiado!' : 'Copiar Link Único'}
                    </button>
                    <button 
                        onClick={handleDownloadCSV}
                        disabled={selectedIds.size === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 font-semibold"
                    >
                        <DownloadIcon className="w-4 h-4" /> Exportar CSV ({selectedIds.size})
                    </button>
                </div>
            </div>

            <div className="bg-secondary rounded-xl shadow-lg border border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-800 text-gray-400 text-xs uppercase">
                            <tr>
                                <th className="px-6 py-4 w-10">
                                    <input 
                                        type="checkbox" 
                                        onChange={handleSelectAll}
                                        checked={selectedIds.size === registrants.length && registrants.length > 0}
                                        className="rounded border-gray-600 bg-gray-700 text-primary focus:ring-primary"
                                    />
                                </th>
                                <th className="px-6 py-4 font-semibold">Nome</th>
                                <th className="px-6 py-4 font-semibold">Email</th>
                                <th className="px-6 py-4 font-semibold">Data</th>
                                <th className="px-6 py-4 font-semibold text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {isLoading ? (
                                <tr><td colSpan={5} className="text-center py-10 text-gray-500">Carregando...</td></tr>
                            ) : registrants.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-10 text-gray-500">Nenhuma inscrição encontrada.</td></tr>
                            ) : (
                                registrants.map(r => (
                                    <tr key={r.id} className={`hover:bg-gray-700/30 transition-colors ${selectedIds.has(r.id) ? 'bg-primary/5' : ''}`}>
                                        <td className="px-6 py-4">
                                            <input 
                                                type="checkbox" 
                                                checked={selectedIds.has(r.id)}
                                                onChange={() => toggleSelection(r.id)}
                                                className="rounded border-gray-600 bg-gray-700 text-primary focus:ring-primary"
                                            />
                                        </td>
                                        <td className="px-6 py-4 text-white font-medium">{r.firstName} {r.lastName}</td>
                                        <td className="px-6 py-4 text-gray-400">{r.email}</td>
                                        <td className="px-6 py-4 text-gray-500 text-xs">
                                            {r.createdAt ? (r.createdAt as any).toDate().toLocaleDateString('pt-BR') : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button onClick={() => handleDelete(r.id)} className="text-red-400 hover:text-red-300 p-2">
                                                <TrashIcon className="w-5 h-5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div className="mt-4 bg-blue-900/20 border border-blue-800 p-4 rounded-lg">
                <p className="text-sm text-blue-300">
                    <strong>Dica:</strong> O CSV exportado está no formato padrão para o App Store Connect. Vá em <em>TestFlight &gt; External Testers &gt; clique no "+" &gt; Import from CSV</em>.
                </p>
            </div>
        </div>
    );
};

export default AdminAppleTestReview;
