
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { OneTimePost, OneTimePostSubmission, Timestamp } from '../types';
import { getOneTimePostById, getOneTimePostSubmissions, updateOneTimePostSubmission, deleteOneTimePostSubmission } from '../services/postService';
import { ArrowLeftIcon, DownloadIcon, InstagramIcon, PencilIcon, TrashIcon } from '../components/Icons';

interface EditSubmissionModalProps {
    isOpen: boolean;
    onClose: () => void;
    submission: OneTimePostSubmission | null;
    onSave: (id: string, data: Partial<OneTimePostSubmission>) => Promise<void>;
}

const EditSubmissionModal: React.FC<EditSubmissionModalProps> = ({ isOpen, onClose, submission, onSave }) => {
    const [formData, setFormData] = useState({
        guestName: '',
        email: '',
        instagram: '',
    });
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (submission) {
            setFormData({
                guestName: submission.guestName,
                email: submission.email || '',
                instagram: submission.instagram,
            });
        }
    }, [submission]);

    if (!isOpen || !submission) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await onSave(submission.id, formData);
            onClose();
        } catch (error) {
            console.error(error);
            alert('Erro ao salvar alterações.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold text-white mb-4">Editar Cadastro</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300">Nome na Lista</label>
                        <input
                            type="text"
                            name="guestName"
                            value={formData.guestName}
                            onChange={handleChange}
                            className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300">Email</label>
                        <input
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300">Instagram</label>
                        <input
                            type="text"
                            name="instagram"
                            value={formData.instagram}
                            onChange={handleChange}
                            className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white"
                            required
                        />
                    </div>
                    <div className="flex justify-end gap-3 mt-6">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500">Cancelar</button>
                        <button type="submit" disabled={isSaving} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50">
                            {isSaving ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const OneTimePostDetails: React.FC = () => {
    const { postId } = useParams<{ postId: string }>();
    const navigate = useNavigate();

    const [post, setPost] = useState<OneTimePost | null>(null);
    const [submissions, setSubmissions] = useState<OneTimePostSubmission[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    
    // Edit/Delete State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingSubmission, setEditingSubmission] = useState<OneTimePostSubmission | null>(null);

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
        const headers = ["Nome na Lista", "Email", "Instagram", "Data de Envio"];
        const rows = submissions.map(sub => `"${sub.guestName}","${sub.email || ''}","${sub.instagram || ''}","${formatDate(sub.submittedAt)}"`);
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

    const handleDeleteSubmission = async (subId: string) => {
        if (!window.confirm("Tem certeza que deseja excluir este cadastro?")) return;
        try {
            await deleteOneTimePostSubmission(subId);
            // Refresh data
            const submissionsData = await getOneTimePostSubmissions(postId!);
            setSubmissions(submissionsData);
        } catch (err: any) {
            alert("Erro ao excluir: " + err.message);
        }
    };

    const handleEditClick = (sub: OneTimePostSubmission) => {
        setEditingSubmission(sub);
        setIsEditModalOpen(true);
    };

    const handleSaveEdit = async (id: string, data: Partial<OneTimePostSubmission>) => {
        await updateOneTimePostSubmission(id, data);
        // Refresh data
        const submissionsData = await getOneTimePostSubmissions(postId!);
        setSubmissions(submissionsData);
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
                             <h2 className="text-2xl font-bold text-white">{post.eventName}</h2>
                             <p className="text-gray-400 mt-1">Categoria: <span className="text-primary">{post.campaignName}</span></p>
                             <p className="text-sm text-gray-400 mt-1">Nome da Lista: <span className="font-semibold">{post.guestListName}</span></p>
                             {post.expiresAt && <p className="text-sm text-yellow-400 mt-1">Expira em: <span className="font-semibold">{formatDate(post.expiresAt)}</span></p>}
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
                                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                    {submissions.length === 0 ? (
                                        <tr><td colSpan={5} className="text-center py-8 text-gray-400">Nenhuma submissão recebida.</td></tr>
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
                                                <td className="px-4 py-3 whitespace-nowrap text-right">
                                                    <div className="flex justify-end gap-3">
                                                        <button onClick={() => handleEditClick(sub)} className="text-blue-400 hover:text-blue-300" title="Editar">
                                                            <PencilIcon className="w-5 h-5" />
                                                        </button>
                                                        <button onClick={() => handleDeleteSubmission(sub.id)} className="text-red-400 hover:text-red-300" title="Excluir">
                                                            <TrashIcon className="w-5 h-5" />
                                                        </button>
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
            <EditSubmissionModal 
                isOpen={isEditModalOpen} 
                onClose={() => setIsEditModalOpen(false)} 
                submission={editingSubmission} 
                onSave={handleSaveEdit} 
            />
        </div>
    );
};

export default OneTimePostDetails;
