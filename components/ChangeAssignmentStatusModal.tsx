
import React, { useState, useEffect } from 'react';
import { PostAssignment } from '../types';
import { serverTimestamp } from 'firebase/firestore';
import PhotoViewerModal from './PhotoViewerModal';
import { TrashIcon } from './Icons';

interface ChangeAssignmentStatusModalProps {
    isOpen: boolean;
    onClose: () => void;
    assignment: PostAssignment | null;
    onSave: (assignmentId: string, data: Partial<PostAssignment>) => Promise<void>;
}

const ChangeAssignmentStatusModal: React.FC<ChangeAssignmentStatusModalProps> = ({ isOpen, onClose, assignment, onSave }) => {
    const [action, setAction] = useState<'change_status' | 'manage_justification'>('change_status');
    const [selectedStatus, setSelectedStatus] = useState<'pending' | 'confirmed' | 'completed_manual'>('pending');
    const [justificationStatus, setJustificationStatus] = useState<'accepted' | 'rejected' | 'pending'>('pending');
    const [justificationResponse, setJustificationResponse] = useState('');

    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    // State for Photo Viewer
    const [isPhotoViewerOpen, setIsPhotoViewerOpen] = useState(false);
    const [photoViewerStartIndex, setPhotoViewerStartIndex] = useState(0);

    useEffect(() => {
        if (assignment) {
            if(assignment.proofSubmittedAt) {
                setSelectedStatus('completed_manual');
            } else {
                setSelectedStatus(assignment.status);
            }
            
            if (assignment.justification) {
                setAction('manage_justification');
                setJustificationStatus(assignment.justificationStatus || 'pending');
                setJustificationResponse(assignment.justificationResponse || '');
            } else {
                setAction('change_status');
                setJustificationResponse('');
            }
        }
    }, [assignment]);

    if (!isOpen || !assignment) return null;

    const handleSave = async () => {
        setIsSaving(true);
        setError('');
        let dataToSave: Partial<PostAssignment> = {};

        if (action === 'change_status') {
            if (selectedStatus === 'completed_manual') {
                dataToSave = {
                    status: 'confirmed', // A completed post is also a confirmed one
                    proofSubmittedAt: serverTimestamp(),
                    proofImageUrls: ['manual'], // Special value to indicate manual completion
                    justification: undefined, // Clear any previous justification
                    justificationStatus: undefined,
                    justificationSubmittedAt: null,
                };
            } else {
                 dataToSave = {
                    status: selectedStatus,
                    proofSubmittedAt: null, // Reset proof if status is reverted
                    proofImageUrls: [],
                 };
            }
        } else if (action === 'manage_justification') {
            dataToSave = {
                justificationStatus: justificationStatus,
                justificationResponse: justificationResponse,
            };
        }
        
        try {
            await onSave(assignment.id, dataToSave);
            onClose();
        } catch (err: any) {
            setError(err.message || 'Falha ao salvar o status.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleResetJustification = async () => {
        if (!assignment) return;
        if (!window.confirm("Tem certeza que deseja resetar a justificativa? Isso removerá a justificativa e permitirá que a divulgadora envie uma comprovação novamente.")) {
            return;
        }
        setIsSaving(true);
        setError('');
        try {
            const dataToSave: Partial<PostAssignment> = {
                justification: '',
                justificationStatus: null,
                justificationSubmittedAt: null,
                justificationImageUrls: [],
            };
            await onSave(assignment.id, dataToSave);
            onClose();
        } catch (err: any) {
            setError(err.message || 'Falha ao resetar justificativa.');
        } finally {
            setIsSaving(false);
        }
    };

    const openPhotoViewer = (index: number) => {
        if (assignment.proofImageUrls && assignment.proofImageUrls[index] === 'DELETED_PROOF') return;
        setPhotoViewerStartIndex(index);
        setIsPhotoViewerOpen(true);
    };

    const hasProof = assignment.proofImageUrls && assignment.proofImageUrls.length > 0 && assignment.proofImageUrls[0] !== 'manual';

    const renderJustificationSection = () => (
         <div>
            <p className="text-gray-300 mb-2">Divulgadora: <span className="font-semibold text-white">{assignment.promoterName}</span></p>
            <div className="bg-dark/70 p-3 rounded-md mb-4">
                <p className="text-sm text-gray-400 italic whitespace-pre-wrap break-all">"{assignment.justification}"</p>
            </div>
            {assignment.justificationImageUrls && assignment.justificationImageUrls.length > 0 && (
                <div className="mb-4">
                    <p className="text-xs text-gray-400 mb-1">Imagens da Justificativa:</p>
                    <div className="flex gap-2">
                        {assignment.justificationImageUrls.map((url, index) => (
                           <a key={index} href={url} target="_blank" rel="noopener noreferrer">
                                <img src={url} alt={`Justificativa ${index + 1}`} className="w-16 h-16 object-cover rounded-md border-2 border-yellow-500" />
                            </a>
                        ))}
                    </div>
                </div>
            )}
            <div className="space-y-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="radio" value="accepted" checked={justificationStatus === 'accepted'} onChange={() => setJustificationStatus('accepted')} className="h-4 w-4 text-primary bg-gray-700 border-gray-600 focus:ring-primary" />
                    <span className="text-green-400">Aceitar Justificativa</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="radio" value="rejected" checked={justificationStatus === 'rejected'} onChange={() => setJustificationStatus('rejected')} className="h-4 w-4 text-primary bg-gray-700 border-gray-600 focus:ring-primary" />
                    <span className="text-red-400">Rejeitar Justificativa</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="radio" value="pending" checked={justificationStatus === 'pending'} onChange={() => setJustificationStatus('pending')} className="h-4 w-4 text-primary bg-gray-700 border-gray-600 focus:ring-primary" />
                    <span className="text-yellow-400">Manter como Pendente</span>
                </label>
            </div>
            <div className="mt-4">
                <label htmlFor="justificationResponse" className="block text-sm font-medium text-gray-300">
                    Resposta para a Divulgadora (Opcional)
                </label>
                <textarea
                    id="justificationResponse"
                    value={justificationResponse}
                    onChange={(e) => setJustificationResponse(e.target.value)}
                    rows={3}
                    placeholder="Deixe um feedback sobre a justificativa..."
                    className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm bg-gray-800 text-gray-200 focus:outline-none focus:ring-primary focus:border-primary"
                />
            </div>
            <div className="mt-6 border-t border-gray-600 pt-4">
                <button
                    type="button"
                    onClick={handleResetJustification}
                    className="w-full text-center px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700 text-sm font-semibold"
                >
                    Resetar Justificativa
                </button>
                <p className="text-xs text-gray-400 mt-2 text-center">
                    Isso removerá a justificativa e permitirá que a divulgadora envie a comprovação novamente.
                </p>
            </div>
        </div>
    );

     const renderStatusChangeSection = () => (
        <div>
            <p className="text-gray-300 mb-4">Selecione o novo status para <span className="font-semibold text-white">{assignment.promoterName}</span>.</p>
            <div className="space-y-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="radio" value="pending" checked={selectedStatus === 'pending'} onChange={() => setSelectedStatus('pending')} className="h-4 w-4 text-primary bg-gray-700 border-gray-600 focus:ring-primary" />
                    <span>Pendente</span>
                </label>
                 <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="radio" value="confirmed" checked={selectedStatus === 'confirmed'} onChange={() => setSelectedStatus('confirmed')} className="h-4 w-4 text-primary bg-gray-700 border-gray-600 focus:ring-primary" />
                    <span>Confirmado</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="radio" value="completed_manual" checked={selectedStatus === 'completed_manual'} onChange={() => setSelectedStatus('completed_manual')} className="h-4 w-4 text-primary bg-gray-700 border-gray-600 focus:ring-primary" />
                    <span>Concluído (Manual)</span>
                </label>
                 <p className="text-xs text-gray-400 pl-6">Use 'Concluído (Manual)' para registrar uma comprovação que foi recebida fora da plataforma. Esta ação não pode ser desfeita.</p>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex-shrink-0">
                    <h2 className="text-xl font-bold text-white mb-4">Analisar Tarefa</h2>
                    {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
                </div>
                
                <div className="flex-grow overflow-y-auto pr-2 -mr-2 space-y-4">
                    {hasProof && (
                        <div className="mb-4 border-b border-gray-700 pb-4">
                            <h3 className="text-lg font-semibold text-white">Comprovação Enviada</h3>
                            <div className="flex gap-2 mt-2">
                                {assignment.proofImageUrls!.map((url, index) => (
                                    url === 'DELETED_PROOF' ? (
                                        <div key={index} className="w-24 h-24 bg-gray-800 rounded-md border-2 border-gray-600 flex flex-col items-center justify-center text-gray-500">
                                            <TrashIcon className="w-8 h-8 mb-1" />
                                            <span className="text-[10px] uppercase font-bold">Imagem Removida</span>
                                        </div>
                                    ) : (
                                        <img
                                            key={index}
                                            src={url}
                                            alt={`Comprovação ${index + 1}`}
                                            onClick={() => openPhotoViewer(index)}
                                            className="w-24 h-24 object-cover rounded-md cursor-pointer border-2 border-gray-600 hover:border-primary"
                                        />
                                    )
                                ))}
                            </div>
                        </div>
                    )}

                    {assignment.justification ? (
                        <div className="space-y-4">
                            <div className="flex space-x-1 p-1 bg-dark/70 rounded-lg mb-4 w-fit">
                                <button onClick={() => setAction('manage_justification')} className={`px-3 py-1 text-sm rounded-md ${action === 'manage_justification' ? 'bg-primary' : 'hover:bg-gray-700'}`}>Analisar Justificativa</button>
                                <button onClick={() => setAction('change_status')} className={`px-3 py-1 text-sm rounded-md ${action === 'change_status' ? 'bg-primary' : 'hover:bg-gray-700'}`}>Alterar Status Geral</button>
                            </div>
                            {action === 'manage_justification' ? renderJustificationSection() : renderStatusChangeSection()}
                        </div>
                    ) : (
                        renderStatusChangeSection()
                    )}
                </div>
                
                <div className="mt-6 flex justify-end space-x-3 border-t border-gray-700 pt-4 flex-shrink-0">
                    <button onClick={onClose} disabled={isSaving} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500">Cancelar</button>
                    <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50">
                        {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                </div>
            </div>
            {hasProof && (
                <PhotoViewerModal
                    isOpen={isPhotoViewerOpen}
                    onClose={() => setIsPhotoViewerOpen(false)}
                    imageUrls={assignment.proofImageUrls ? assignment.proofImageUrls.filter(u => u !== 'DELETED_PROOF') : []}
                    startIndex={photoViewerStartIndex}
                />
            )}
        </div>
    );
};

export default ChangeAssignmentStatusModal;
