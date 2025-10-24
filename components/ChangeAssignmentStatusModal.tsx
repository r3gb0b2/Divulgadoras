import React, { useState, useEffect } from 'react';
import { PostAssignment } from '../types';

interface ChangeAssignmentStatusModalProps {
    isOpen: boolean;
    onClose: () => void;
    assignment: PostAssignment | null;
    onSave: (assignmentId: string, data: Partial<Pick<PostAssignment, 'justificationStatus'>>) => Promise<void>;
}

const ChangeAssignmentStatusModal: React.FC<ChangeAssignmentStatusModalProps> = ({ isOpen, onClose, assignment, onSave }) => {
    const [status, setStatus] = useState<'pending' | 'accepted' | 'rejected'>('pending');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (assignment) {
            setStatus(assignment.justificationStatus || 'pending');
        }
    }, [assignment]);

    if (!isOpen || !assignment) return null;

    const handleSave = async () => {
        setIsSaving(true);
        setError('');
        try {
            await onSave(assignment.id, { justificationStatus: status });
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to save status.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold text-white mb-4">Analisar Justificativa</h2>
                <p className="text-gray-300 mb-2">Divulgadora: <span className="font-semibold text-white">{assignment.promoterName}</span></p>
                <div className="bg-dark/70 p-3 rounded-md mb-4">
                    <p className="text-sm text-gray-400 italic">"{assignment.justification}"</p>
                </div>
                {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
                <div className="space-y-2">
                    <label className="flex items-center space-x-2 cursor-pointer">
                        <input type="radio" value="accepted" checked={status === 'accepted'} onChange={() => setStatus('accepted')} className="h-4 w-4 text-primary bg-gray-700 border-gray-600 focus:ring-primary" />
                        <span className="text-green-400">Aceitar Justificativa</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                        <input type="radio" value="rejected" checked={status === 'rejected'} onChange={() => setStatus('rejected')} className="h-4 w-4 text-primary bg-gray-700 border-gray-600 focus:ring-primary" />
                        <span className="text-red-400">Rejeitar Justificativa</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                        <input type="radio" value="pending" checked={status === 'pending'} onChange={() => setStatus('pending')} className="h-4 w-4 text-primary bg-gray-700 border-gray-600 focus:ring-primary" />
                        <span className="text-yellow-400">Manter como Pendente</span>
                    </label>
                </div>
                <div className="mt-6 flex justify-end space-x-3">
                    <button onClick={onClose} disabled={isSaving} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500">Cancelar</button>
                    <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50">
                        {isSaving ? 'Salvando...' : 'Salvar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChangeAssignmentStatusModal;
