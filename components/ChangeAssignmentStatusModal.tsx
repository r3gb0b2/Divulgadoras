
import React, { useState, useEffect } from 'react';
import firebase from 'firebase/compat/app';
import { PostAssignment } from '../types';
import { PhotoViewerModal } from './PhotoViewerModal';
// Added SearchIcon to the imports
import { TrashIcon, CheckCircleIcon, XIcon, ClockIcon, SearchIcon } from './Icons';

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
                setSelectedStatus(assignment.status as any);
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
                    status: 'confirmed', 
                    proofSubmittedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    proofImageUrls: ['manual'], 
                    justification: undefined, 
                    justificationStatus: undefined,
                    // Fix: Removed justificationSubmittedAt as it is not needed here
                };
            } else {
                 dataToSave = {
                    status: selectedStatus as any,
                    proofSubmittedAt: firebase.firestore.FieldValue.delete() as any, 
                    proofImageUrls: [],
                 };
            }
        } else if (action === 'manage_justification') {
            dataToSave = {
                justificationStatus: justificationStatus,
                justificationResponse: justificationResponse, // Fix: Property recognized now
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

    const handleQuickAccept = async () => {
        setIsSaving(true);
        try {
            await onSave(assignment.id, { justificationStatus: 'accepted' });
            onClose();
        } catch (err: any) {
            setError('Falha ao aceitar justificativa.');
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
         <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-gray-300 text-sm">Divulgadora: <span className="font-black text-white uppercase tracking-tight">{assignment.promoterName}</span></p>
                <button 
                    onClick={handleQuickAccept} 
                    disabled={isSaving}
                    className="px-4 py-2 bg-green-600 text-white font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-green-500 transition-all flex items-center gap-2 shadow-lg shadow-green-900/20"
                >
                    <CheckCircleIcon className="w-4 h-4" /> Aceitar Agora
                </button>
            </div>
            
            <div className="bg-orange-900/10 p-5 rounded-2xl border border-orange-500/20 shadow-inner">
                <p className="text-sm text-orange-100 italic whitespace-pre-wrap font-medium leading-relaxed">"{assignment.justification}"</p>
            </div>

            {assignment.justificationImageUrls && assignment.justificationImageUrls.length > 0 && (
                <div>
                    <p className="text-[9px] text-gray-500 mb-2 font-black uppercase tracking-[0.2em] ml-1">Anexos de Comprovação:</p>
                    <div className="flex gap-3 overflow-x-auto pb-2">
                        {assignment.justificationImageUrls.map((url, index) => (
                           <a key={index} href={url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 group relative">
                                <img src={url} alt={`Justificativa ${index + 1}`} className="w-24 h-32 object-cover rounded-xl border-2 border-orange-500/30 group-hover:border-orange-500 transition-all shadow-lg" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                                    <SearchIcon className="w-6 h-6 text-white" />
                                </div>
                            </a>
                        ))}
                    </div>
                </div>
            )}

            <div className="bg-dark/50 p-4 rounded-2xl border border-white/5 space-y-4">
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Opções de Decisão</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button 
                        onClick={() => setJustificationStatus('accepted')}
                        className={`flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${justificationStatus === 'accepted' ? 'bg-green-600 text-white border-green-500 shadow-lg' : 'bg-gray-800 text-gray-400 hover:text-gray-300'}`}
                    >
                        <CheckCircleIcon className="w-4 h-4" /> Aprovar
                    </button>
                    <button 
                        onClick={() => setJustificationStatus('rejected')}
                        className={`flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${justificationStatus === 'rejected' ? 'bg-red-600 text-white border-red-500 shadow-lg' : 'bg-gray-800 text-gray-400 hover:text-gray-300'}`}
                    >
                        <XIcon className="w-4 h-4" /> Recusar
                    </button>
                    <button 
                        onClick={() => setJustificationStatus('pending')}
                        className={`flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${justificationStatus === 'pending' ? 'bg-yellow-600 text-white border-yellow-500 shadow-lg' : 'bg-gray-800 text-gray-400 hover:text-gray-300'}`}
                    >
                        <ClockIcon className="w-4 h-4" /> Pendente
                    </button>
                </div>
                
                <div>
                    <label htmlFor="justificationResponse" className="block text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1.5 ml-1">
                        Mensagem para Divulgadora (Opcional)
                    </label>
                    <textarea
                        id="justificationResponse"
                        value={justificationResponse}
                        onChange={(e) => setJustificationResponse(e.target.value)}
                        rows={3}
                        placeholder="Informe o motivo da recusa ou deixe um feedback..."
                        className="w-full px-4 py-3 border border-gray-700 rounded-2xl bg-dark text-gray-200 focus:ring-1 focus:ring-primary outline-none text-sm font-medium"
                    />
                </div>
            </div>

            <div className="pt-2 flex justify-center">
                <button
                    type="button"
                    onClick={handleResetJustification}
                    className="text-[10px] font-black text-gray-500 uppercase tracking-widest hover:text-red-400 transition-colors flex items-center gap-2"
                >
                    <TrashIcon className="w-3.5 h-3.5" /> Excluir Justificativa e Permitir Novo Envio
                </button>
            </div>
        </div>
    );

     const renderStatusChangeSection = () => (
        <div className="space-y-5">
            <p className="text-gray-300 text-sm">Selecione o novo status da tarefa de <span className="font-bold text-white">{assignment.promoterName}</span>.</p>
            
            <div className="grid grid-cols-1 gap-3">
                <label className={`flex items-center p-4 rounded-2xl border cursor-pointer transition-all ${selectedStatus === 'pending' ? 'bg-primary/10 border-primary text-white' : 'bg-gray-800 border-white/5 text-gray-400 hover:bg-gray-700'}`}>
                    <input type="radio" value="pending" checked={selectedStatus === 'pending'} onChange={() => setSelectedStatus('pending')} className="sr-only" />
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mr-4 ${selectedStatus === 'pending' ? 'border-primary' : 'border-gray-500'}`}>
                        {selectedStatus === 'pending' && <div className="w-2.5 h-2.5 bg-primary rounded-full"></div>}
                    </div>
                    <div>
                        <p className="font-black text-xs uppercase tracking-widest">Pendente</p>
                        <p className="text-[10px] opacity-70">A tarefa volta ao estado inicial para o divulgadora.</p>
                    </div>
                </label>

                <label className={`flex items-center p-4 rounded-2xl border cursor-pointer transition-all ${selectedStatus === 'confirmed' ? 'bg-primary/10 border-primary text-white' : 'bg-gray-800 border-white/5 text-gray-400 hover:bg-gray-700'}`}>
                    <input type="radio" value="confirmed" checked={selectedStatus === 'confirmed'} onChange={() => setSelectedStatus('confirmed')} className="sr-only" />
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mr-4 ${selectedStatus === 'confirmed' ? 'border-primary' : 'border-gray-500'}`}>
                        {selectedStatus === 'confirmed' && <div className="w-2.5 h-2.5 bg-primary rounded-full"></div>}
                    </div>
                    <div>
                        <p className="font-black text-xs uppercase tracking-widest">Confirmado (Aguardando Print)</p>
                        <p className="text-[10px] opacity-70">Marca que a divulgadora já clicou em 'Eu Postei'.</p>
                    </div>
                </label>

                <label className={`flex items-center p-4 rounded-2xl border cursor-pointer transition-all ${selectedStatus === 'completed_manual' ? 'bg-green-900/20 border-green-500/50 text-white' : 'bg-gray-800 border-white/5 text-gray-400 hover:bg-gray-700'}`}>
                    <input type="radio" value="completed_manual" checked={selectedStatus === 'completed_manual'} onChange={() => setSelectedStatus('completed_manual')} className="sr-only" />
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mr-4 ${selectedStatus === 'completed_manual' ? 'border-green-500' : 'border-gray-500'}`}>
                        {selectedStatus === 'completed_manual' && <div className="w-2.5 h-2.5 bg-green-500 rounded-full"></div>}
                    </div>
                    <div>
                        <p className="font-black text-xs uppercase tracking-widest">Concluir Manualmente</p>
                        <p className="text-[10px] opacity-70 text-green-400 font-bold">Dê presença para esta tarefa agora sem exigir o print.</p>
                    </div>
                </label>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-secondary rounded-[2.5rem] shadow-2xl p-8 w-full max-w-lg max-h-[90vh] flex flex-col border border-white/5" onClick={e => e.stopPropagation()}>
                <div className="flex-shrink-0 flex justify-between items-start mb-6">
                    <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Analisar Tarefa</h2>
                    <button onClick={onClose} className="p-2 text-gray-500 hover:text-white transition-colors"><XIcon className="w-6 h-6"/></button>
                </div>

                {error && <div className="bg-red-900/30 text-red-300 p-3 rounded-2xl mb-4 text-[11px] font-bold border border-red-800/50 text-center animate-shake">{error}</div>}
                
                <div className="flex-grow overflow-y-auto pr-2 -mr-2 space-y-6">
                    {hasProof && (
                        <div className="p-5 bg-dark/40 rounded-3xl border border-white/5">
                            <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4">Prints de Comprovação</h3>
                            <div className="flex flex-wrap gap-4">
                                {assignment.proofImageUrls!.map((url, index) => (
                                    url === 'DELETED_PROOF' ? (
                                        <div key={index} className="w-28 h-36 bg-gray-800/50 rounded-2xl border-2 border-dashed border-gray-700 flex flex-col items-center justify-center text-gray-600">
                                            <TrashIcon className="w-8 h-8 mb-2" />
                                            <span className="text-[9px] uppercase font-black tracking-widest">Removido</span>
                                        </div>
                                    ) : (
                                        <div key={index} className="relative group cursor-pointer" onClick={() => openPhotoViewer(index)}>
                                            <img
                                                src={url}
                                                alt=""
                                                className="w-28 h-36 object-cover rounded-2xl border-2 border-gray-700 group-hover:border-primary transition-all shadow-xl"
                                            />
                                            <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex items-center justify-center">
                                                <SearchIcon className="w-6 h-6 text-white" />
                                            </div>
                                        </div>
                                    )
                                ))}
                            </div>
                        </div>
                    )}

                    {assignment.justification ? (
                        <div className="space-y-6">
                            <div className="flex bg-dark p-1 rounded-2xl border border-white/5 w-fit">
                                <button onClick={() => setAction('manage_justification')} className={`px-5 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${action === 'manage_justification' ? 'bg-primary text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>Justificativa</button>
                                <button onClick={() => setAction('change_status')} className={`px-5 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${action === 'change_status' ? 'bg-primary text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>Alterar Status</button>
                            </div>
                            {action === 'manage_justification' ? renderJustificationSection() : renderStatusChangeSection()}
                        </div>
                    ) : (
                        renderStatusChangeSection()
                    )}
                </div>
                
                <div className="mt-8 flex justify-end gap-3 border-t border-white/5 pt-6 flex-shrink-0">
                    <button onClick={onClose} disabled={isSaving} className="flex-1 py-4 bg-gray-800 text-gray-400 font-bold rounded-2xl hover:bg-gray-700 transition-colors uppercase text-xs tracking-widest">Cancelar</button>
                    <button onClick={handleSave} disabled={isSaving} className="flex-[1.5] py-4 bg-primary text-white font-black rounded-2xl hover:bg-primary-dark transition-all shadow-xl shadow-primary/20 disabled:opacity-50 uppercase text-xs tracking-widest flex items-center justify-center gap-2">
                        {isSaving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> : <CheckCircleIcon className="w-5 h-5" />}
                        {isSaving ? 'Salvando...' : 'Aplicar Alteração'}
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
