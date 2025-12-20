import React, { useState, useEffect } from 'react';
import { Promoter, Campaign } from '../types';
import { getAllCampaigns } from '../services/settingsService';
import { deletePushToken } from '../services/promoterService';
import { stateMap } from '../constants/states';
import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { FaceIdIcon, LockClosedIcon, TrashIcon } from './Icons';

interface EditPromoterModalProps {
  promoter: Promoter | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, data: Partial<Omit<Promoter, 'id'>>) => Promise<void>;
}

const EditPromoterModal: React.FC<EditPromoterModalProps> = ({ promoter, isOpen, onClose, onSave }) => {
  const [formData, setFormData] = useState<Partial<Omit<Promoter, 'id'>>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingPush, setIsTestingPush] = useState(false);
  const [isDeletingToken, setIsDeletingToken] = useState(false);

  useEffect(() => {
    if (promoter) {
      setFormData({
        name: promoter.name,
        email: promoter.email,
        whatsapp: promoter.whatsapp,
        instagram: promoter.instagram,
        status: promoter.status,
        hasJoinedGroup: promoter.hasJoinedGroup || false,
        observation: promoter.observation || '',
      });
    }
  }, [promoter, isOpen]);

  const handleTestPush = async () => {
    if (!promoter?.fcmToken) return;
    setIsTestingPush(true);
    try {
      const sendPush = httpsCallable(functions, 'sendPushCampaign');
      await sendPush({
        title: "Teste de Conexão 🚀",
        body: "Olá " + promoter.name.split(' ')[0] + ", seu app está pronto para receber avisos!",
        url: "/#/posts",
        promoterIds: [promoter.id],
        organizationId: promoter.organizationId
      });
      alert("Notificação de teste enviada!");
    } catch (err: any) {
      alert("Erro ao enviar push: " + err.message);
    } finally {
      setIsTestingPush(false);
    }
  };

  const handleDeleteToken = async () => {
    if (!promoter?.fcmToken || !window.confirm("Deseja deletar este token de notificação? Isso forçará o aplicativo da divulgadora a gerar um novo na próxima vez que ela o abrir.")) return;
    
    setIsDeletingToken(true);
    try {
      await deletePushToken(promoter.id);
      alert("Token removido com sucesso!");
      onClose(); // Fecha para atualizar o estado na lista pai
    } catch (err: any) {
      alert("Erro ao deletar token: " + err.message);
    } finally {
      setIsDeletingToken(false);
    }
  };

  if (!isOpen || !promoter) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
      <div className="bg-secondary rounded-xl shadow-xl p-6 w-full max-w-2xl max-h-[90vh] flex flex-col border border-gray-700">
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-white">Detalhes de {promoter.name}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-3xl">&times;</button>
        </div>

        <div className="flex-grow overflow-y-auto space-y-6 pr-2">
          {/* Status de Notificação Push */}
          <div className={`p-4 rounded-lg flex items-center justify-between ${promoter.fcmToken ? 'bg-green-900/20 border border-green-800' : 'bg-gray-800 border border-gray-700'}`}>
            <div className="flex items-center gap-3">
              <FaceIdIcon className={`w-6 h-6 ${promoter.fcmToken ? 'text-green-400' : 'text-gray-500'}`} />
              <div>
                <p className="text-white text-sm font-bold">Notificações Push (App)</p>
                <p className="text-xs text-gray-400">{promoter.fcmToken ? 'Dispositivo vinculado e ativo' : 'App não instalado ou permissão negada'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {promoter.fcmToken && (
                <>
                  <button onClick={handleDeleteToken} disabled={isDeletingToken} className="p-2 bg-red-900/40 text-red-400 rounded hover:bg-red-900/60 disabled:opacity-50" title="Deletar Token Inválido">
                    <TrashIcon className="w-4 h-4" />
                  </button>
                  <button onClick={handleTestPush} disabled={isTestingPush} className="px-3 py-1 bg-green-600 text-white text-xs font-bold rounded hover:bg-green-700 disabled:opacity-50">
                    {isTestingPush ? 'Enviando...' : 'Enviar Teste'}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
             <h3 className="text-sm font-bold text-indigo-400 mb-3 flex items-center gap-2">
                <LockClosedIcon className="w-4 h-4" /> DADOS SENSÍVEIS
             </h3>
             <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <p className="text-gray-500 uppercase text-[10px] font-bold">CPF</p>
                    <p className="text-white font-mono">{promoter.cpf || 'Não informado'}</p>
                </div>
                <div>
                    <p className="text-gray-500 uppercase text-[10px] font-bold">RG</p>
                    <p className="text-white font-mono">{promoter.rg || 'Não informado'}</p>
                </div>
             </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 uppercase font-bold">Status Atual</label>
              <select className="w-full bg-gray-800 text-white p-2 rounded-md mt-1 border-gray-600" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as any})}>
                <option value="pending">Pendente</option>
                <option value="approved">Aprovado</option>
                <option value="rejected">Rejeitado</option>
                <option value="removed">Removida</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase font-bold">No Grupo?</label>
              <div className="mt-2">
                <input type="checkbox" checked={formData.hasJoinedGroup} onChange={e => setFormData({...formData, hasJoinedGroup: e.target.checked})} className="mr-2" />
                <span className="text-sm text-gray-300">Confirmar entrada no WhatsApp</span>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 uppercase font-bold">Observações (Interno)</label>
            <textarea className="w-full bg-gray-800 text-white p-3 rounded-md mt-1 border border-gray-600 min-h-[100px]" value={formData.observation} onChange={e => setFormData({...formData, observation: e.target.value})} placeholder="Anotações sobre a conduta da divulgadora..." />
          </div>

          <div className="border-t border-gray-700 pt-4">
            <h3 className="text-white font-bold mb-2">Fotos de Perfil</h3>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {promoter.photoUrls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer" className="flex-shrink-0">
                  <img src={url} className="w-24 h-32 object-cover rounded-lg border border-gray-700 hover:border-primary" alt="Foto" />
                </a>
              ))}
            </div>
          </div>

          {promoter.documentUrls && promoter.documentUrls.length > 0 && (
            <div className="border-t border-gray-700 pt-4">
                <h3 className="text-white font-bold mb-2 text-indigo-300">Documentos de Identidade</h3>
                <div className="flex gap-2 overflow-x-auto pb-2">
                {promoter.documentUrls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer" className="flex-shrink-0">
                    <img src={url} className="w-32 h-24 object-cover rounded-lg border-2 border-indigo-900 hover:border-indigo-500" alt="Documento" />
                    </a>
                ))}
                </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3 border-t border-gray-700 pt-4">
          <button onClick={onClose} className="px-4 py-2 text-gray-400 font-bold hover:text-white">Cancelar</button>
          <button onClick={() => onSave(promoter.id, formData)} disabled={isSaving} className="px-6 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark disabled:opacity-50">
            {isSaving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditPromoterModal;