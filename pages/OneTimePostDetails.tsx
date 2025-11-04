import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { OneTimePost, OneTimePostSubmission, Timestamp } from '../types';
import { getOneTimePostById, getOneTimePostSubmissions } from '../services/postService';
import { ArrowLeftIcon, DownloadIcon, InstagramIcon } from '../components/Icons';

const OneTimePostDetails: React.FC = () => {
    const { postId } = useParams<{ postId: string }>();
    const navigate = useNavigate();

    const [post, setPost] = useState<OneTimePost | null>(null);
    const [submissions, setSubmissions] = useState<OneTimePostSubmission[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchData = useCallback(async () => {
        if (!postId) {
            setError("ID do post não encontrado.");
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setError('');
        try {
            const [postData, submissionsData] = await Promise.all([
                getOneTimePostById(postId),
                getOneTimePostSubmissions(postId)
            ]);
            if (!postData) throw new Error("Post não encontrado.");
            setPost(postData);
            setSubmissions(submissionsData);
        } catch (err: any) {
            setError(err.message || 'Falha ao buscar detalhes.');
        } finally {
            setIsLoading(false);
        }
    }, [postId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const formatDate = (timestamp: any): string => {
        if (!timestamp) return 'N/A';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleString('pt-BR');
    };
    
    const handleDownloadCSV = () => {
        if (submissions.length === 0 || !post) return;
        const headers = ["Nome na Lista", "Instagram", "Data de Envio"];
        const rows = submissions.map(sub => `"${sub.guestName}","${sub.instagram || ''}","${formatDate(sub.submittedAt)}"`);
        const csvContent = [headers.join(','), ...rows].join('\n');
        
        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]); // UTF-8 BOM
        const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        const fileName = `${post.guestListName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;

        link.setAttribute("href", url);
        link.setAttribute("download", fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div>
            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4">
                <ArrowLeftIcon className="w-5 h-5" />
                <span>Voltar</span>
            </button>
            <h1 className="text-3xl font-bold mb-6">Detalhes do Post Único</h1>

            <div className="bg-secondary p-6 rounded-lg shadow-lg">
                {isLoading ? <p className="text-center">Carregando...</p> : error ? <p className="text-red-400">{error}</p> : post && (
                    <>
                        <div className="mb-6 pb-4 border-b border-gray-700">
                             <h2 className="text-2xl font-bold">{post.campaignName}</h2>
                             {post.eventName && <p className="text-lg text-primary">{post.eventName}</p>}
                             <p className="text-sm text-gray-400">Nome da Lista: <span className="font-semibold">{post.guestListName}</span></p>
                             {post.expiresAt && <p className="text-sm text-yellow-400">Expira em: <span className="font-semibold">{formatDate(post.expiresAt)}</span></p>}
                        </div>
                        
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-2xl font-bold">Submissões ({submissions.length})</h2>
                            <button onClick={handleDownloadCSV} disabled={submissions.length === 0} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-semibold disabled:opacity-50">
                                <DownloadIcon className="w-4 h-4"/>
                                Baixar CSV
                            </button>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-700">
                                <thead className="bg-gray-700/50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Nome na Lista</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Instagram</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Data de Envio</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Comprovação</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                    {submissions.length === 0 ? (
                                        <tr><td colSpan={4} className="text-center py-8 text-gray-400">Nenhuma submissão recebida.</td></tr>
                                    ) : (
                                        submissions.map(sub => (
                                            <tr key={sub.id} className="hover:bg-gray-700/40">
                                                <td className="px-4 py-3 whitespace-nowrap font-medium text-white">{sub.guestName}</td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <a href={`https://instagram.com/${sub.instagram}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-pink-400 hover:underline">
                                                        <InstagramIcon className="w-4 h-4" />
                                                        <span>{sub.instagram}</span>
                                                    </a>
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">{formatDate(sub.submittedAt)}</td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                     <div className="flex gap-2">
                                                        {sub.proofImageUrls.map((url, i) => (
                                                            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="focus:outline-none">
                                                                <img src={url} alt={`Prova ${i+1}`} className="w-12 h-12 object-cover rounded-md" />
                                                            </a>
                                                        ))}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default OneTimePostDetails;