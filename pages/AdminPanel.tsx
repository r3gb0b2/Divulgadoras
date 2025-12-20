
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import firebase from 'firebase/compat/app';
import { findPromotersByEmail, getAllPromoters, getPromoterStats, updatePromoter, getRejectionReasons } from '../services/promoterService';
import { getOrganizations, getOrganization } from '../services/organizationService';
import { getAllCampaigns } from '../services/settingsService';
import { getAssignmentsForOrganization } from '../services/postService';
import { Promoter, AdminUserData, PromoterStatus, RejectionReason, Organization, Campaign, PostAssignment } from '../types';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { ArrowLeftIcon, SearchIcon, RefreshIcon } from '../components/Icons';

export const AdminPanel: React.FC<{ adminData: AdminUserData }> = ({ adminData }) => {
    const { selectedOrgId } = useAdminAuth();
    const navigate = useNavigate();
    const [lookupEmail, setLookupEmail] = useState('');
    const [isLookingUp, setIsLookingUp] = useState(false);
    const [lookupError, setLookupError] = useState('');
    const [lookupResults, setLookupResults] = useState<Promoter[] | null>(null);
    const [isLookupModalOpen, setIsLookupModalOpen] = useState(false);

    const handleLookupPromoter = async (emailToSearch?: string) => {
        const searchInput = typeof emailToSearch === 'string' ? emailToSearch : lookupEmail;
        const finalEmail = searchInput.trim();
        if (!finalEmail) return;
        
        setIsLookingUp(true);
        setLookupError(''); 
        setLookupResults(null);
        setIsLookupModalOpen(true);
        try {
            const results = await findPromotersByEmail(finalEmail);
            setLookupResults(results);
        } catch (err: any) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            setLookupError(errorMessage);
        } finally {
            setIsLookingUp(false);
        }
    };

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Painel de Administração</h1>
            <div className="bg-secondary p-4 rounded-lg border border-gray-700">
                <p className="text-gray-400">Ambiente Administrativo - Equipe Certa</p>
                <div className="mt-4 flex gap-2">
                    <input 
                        type="email" 
                        value={lookupEmail}
                        onChange={(e) => setLookupEmail(e.target.value)}
                        placeholder="Buscar por e-mail..."
                        className="bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white flex-grow"
                    />
                    <button 
                        onClick={() => handleLookupPromoter()}
                        className="bg-primary px-4 py-2 rounded text-white font-bold"
                    >
                        Buscar
                    </button>
                </div>
                {lookupError && <p className="text-red-400 mt-2 text-sm">{lookupError}</p>}
            </div>
        </div>
    );
};
