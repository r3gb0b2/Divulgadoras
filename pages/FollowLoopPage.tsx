
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { findPromotersByEmail } from '../services/promoterService';
import { 
  joinFollowLoop, 
  getParticipantStatus, 
  getNextProfileToFollow, 
  registerFollow, 
  getPendingValidations, 
  validateFollow 
} from '../services/followLoopService';
import { Promoter, FollowLoopParticipant, FollowInteraction } from '../types';
import { ArrowLeftIcon, InstagramIcon, HeartIcon, RefreshIcon, CheckCircleIcon, XIcon } from '../components/Icons';

const FollowLoopPage: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [promoter, setPromoter] = useState<Promoter | null>(null);
  const [participant, setParticipant] = useState<FollowLoopParticipant | null>(null);
  
  const [activeTab, setActiveTab] = useState<'follow' | 'validate'>('follow');
  const [targetProfile, setTargetProfile] = useState<FollowLoopParticipant | null>(null);
  const [validations, setValidations] = useState<FollowInteraction[]>([]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasClickedLink, setHasClickedLink] = useState(false);

  // --- Auth / Entry ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const profiles = await findPromotersByEmail(email);
      // Find an approved profile. Prefer one already in a group.
      const approved = profiles.find(p => p.status === 'approved');
      
      if (!approved) {
        throw new Error('Nenhum cadastro aprovado encontrado para este e-mail.');
      }
      
      setPromoter(approved);
      setIsLoggedIn(true);
      
      // Check if already participating
      const partStatus = await getParticipantStatus(approved.id);
      setParticipant(partStatus);
      
      if (partStatus) {
        loadNextTarget(approved.id, approved.organizationId);
        loadValidations(approved.id);
      }

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!promoter) return;
    setIsLoading(true);
    try {
      await joinFollowLoop(promoter.id);
      const status = await getParticipantStatus(promoter.id);
      setParticipant(status);
      loadNextTarget(promoter.id, promoter.organizationId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Core Logic ---

  const loadNextTarget = useCallback(async (pid: string, orgId: string) => {
    setTargetProfile(null);
    setHasClickedLink(false);
    try {
      const next = await getNextProfileToFollow(pid, orgId);
      setTargetProfile(next);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const loadValidations = useCallback(async (pid: string) => {
    try {
      const list = await getPendingValidations(pid);
      setValidations(list);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const handleInstagramClick = () => {
    setHasClickedLink(true);
    // Open Instagram
    if (targetProfile) {
        const handle = targetProfile.instagram.replace('@', '').replace('/', '');
        window.open(`https://instagram.com/${handle}`, '_blank');
    }
  };

  const handleConfirmFollow = async () => {
    if (!promoter || !targetProfile) return;
    setIsLoading(true);
    try {
      await registerFollow(promoter.id, targetProfile.id);
      // Load next
      await loadNextTarget(promoter.id, promoter.organizationId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = () => {
      if (promoter) {
        loadNextTarget(promoter.id, promoter.organizationId);
      }
  };

  const handleValidationAction = async (interactionId: string, isValid: boolean, followerId: string) => {
      if (!promoter) return;
      try {
          await validateFollow(interactionId, isValid, followerId);
          setValidations(prev => prev.filter(v => v.id !== interactionId));
      } catch (err: any) {
          alert(err.message);
      }
  };

  // --- Renders ---

  if (!isLoggedIn) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
         <button onClick={() => navigate('/')} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4">
            <ArrowLeftIcon className="w-5 h-5" />
            <span>Voltar para Início</span>
        </button>
        <div className="bg-secondary shadow-2xl rounded-lg p-8 text-center">
          <h1 className="text-3xl font-bold text-white mb-2">Conexão Divulgadoras</h1>
          <p className="text-gray-400 mb-6">Ganhe seguidores reais da sua equipe! Entre com seu e-mail para participar.</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Seu e-mail de cadastro"
              className="w-full px-4 py-3 border border-gray-600 rounded-lg bg-gray-800 text-white focus:ring-2 focus:ring-primary outline-none"
              required
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button type="submit" disabled={isLoading} className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50">
              {isLoading ? 'Entrando...' : 'Acessar'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!participant) {
    return (
      <div className="max-w-md mx-auto px-4 py-8 text-center">
         <div className="bg-secondary shadow-2xl rounded-lg p-8">
            <h2 className="text-2xl font-bold text-white mb-4">Olá, {promoter?.name}!</h2>
            <p className="text-gray-300 mb-6">
                Ao participar da dinâmica <strong>Conexão Divulgadoras</strong>, seu perfil ficará visível para outras meninas da equipe seguirem você.
                Em troca, você também deve seguir as colegas. Vamos crescer juntas?
            </p>
            <button onClick={handleJoin} disabled={isLoading} className="w-full py-4 bg-green-600 text-white font-bold rounded-lg text-lg shadow-lg hover:bg-green-700 transition-colors">
                {isLoading ? 'Entrando...' : 'Quero Participar! 🚀'}
            </button>
         </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 pb-20 pt-4">
       <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-white">Conexão Divulgadoras</h2>
            <div className="flex gap-2 text-xs font-mono bg-gray-800 px-2 py-1 rounded">
                <span className="text-green-400">Seguindo: {participant.followingCount}</span>
            </div>
       </div>

       {/* Tabs */}
       <div className="flex mb-6 bg-gray-800 rounded-lg p-1">
           <button 
             onClick={() => setActiveTab('follow')} 
             className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'follow' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
           >
               Seguir Colegas
           </button>
           <button 
             onClick={() => { setActiveTab('validate'); if(promoter) loadValidations(promoter.id); }} 
             className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'validate' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
           >
               Validar ({validations.length})
           </button>
       </div>

       {activeTab === 'follow' && (
           <div className="flex flex-col items-center">
               {targetProfile ? (
                   <div className="w-full bg-secondary rounded-xl shadow-xl overflow-hidden border border-gray-700 relative">
                       <div className="h-24 bg-gradient-to-r from-purple-800 to-pink-800"></div>
                       <div className="px-6 pb-8 text-center -mt-12">
                           <img 
                             src={targetProfile.photoUrl || 'https://via.placeholder.com/150'} 
                             alt={targetProfile.promoterName} 
                             className="w-24 h-24 rounded-full border-4 border-secondary mx-auto object-cover bg-gray-900"
                           />
                           <h3 className="text-2xl font-bold text-white mt-3">{targetProfile.promoterName}</h3>
                           <p className="text-pink-400 font-medium text-lg mb-6">{targetProfile.instagram}</p>
                           
                           <div className="space-y-3">
                               {!hasClickedLink ? (
                                   <button 
                                     onClick={handleInstagramClick}
                                     className="w-full py-3 bg-white text-pink-600 font-bold rounded-full hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
                                   >
                                       <InstagramIcon className="w-5 h-5" />
                                       Abrir Instagram e Seguir
                                   </button>
                               ) : (
                                   <button 
                                     onClick={handleConfirmFollow}
                                     disabled={isLoading}
                                     className="w-full py-3 bg-green-600 text-white font-bold rounded-full hover:bg-green-700 transition-colors flex items-center justify-center gap-2 animate-pulse"
                                   >
                                       <HeartIcon className="w-5 h-5" />
                                       {isLoading ? 'Salvando...' : 'Já Segui! Próxima'}
                                   </button>
                               )}
                               
                               <button onClick={handleSkip} className="text-gray-500 text-sm hover:text-gray-300 underline mt-2">
                                   Pular perfil
                               </button>
                           </div>
                       </div>
                   </div>
               ) : (
                   <div className="text-center py-10 text-gray-400">
                       <p className="text-lg mb-4">Oba! Você já viu todos os perfis disponíveis no momento.</p>
                       <button onClick={() => promoter && loadNextTarget(promoter.id, promoter.organizationId)} className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 rounded-full hover:bg-gray-600 text-white">
                           <RefreshIcon className="w-4 h-4" /> Verificar Novamente
                       </button>
                   </div>
               )}
           </div>
       )}

       {activeTab === 'validate' && (
           <div className="space-y-4">
               {validations.length === 0 ? (
                   <p className="text-center text-gray-400 py-8">Nenhuma validação pendente. Divulgue seu perfil!</p>
               ) : (
                   validations.map(val => (
                       <div key={val.id} className="bg-gray-800 p-4 rounded-lg flex items-center justify-between">
                           <div>
                               <p className="font-bold text-white">{val.followerName}</p>
                               <p className="text-sm text-pink-400">{val.followerInstagram}</p>
                               <p className="text-xs text-gray-500">Diz que te seguiu.</p>
                           </div>
                           <div className="flex gap-2">
                               <button 
                                 onClick={() => handleValidationAction(val.id, false, val.followerId)}
                                 className="p-2 bg-red-900/30 text-red-400 rounded-full hover:bg-red-900/50"
                                 title="Não Seguiu"
                               >
                                   <XIcon className="w-6 h-6" />
                               </button>
                               <button 
                                 onClick={() => handleValidationAction(val.id, true, val.followerId)}
                                 className="p-2 bg-green-900/30 text-green-400 rounded-full hover:bg-green-900/50"
                                 title="Confirmar (Já Segui de Volta)"
                               >
                                   <CheckCircleIcon className="w-6 h-6" />
                               </button>
                           </div>
                       </div>
                   ))
               )}
               <p className="text-xs text-gray-500 text-center mt-4">Verifique no seu Instagram se a pessoa realmente te seguiu antes de confirmar. Seja honesta!</p>
           </div>
       )}
    </div>
  );
};

export default FollowLoopPage;
