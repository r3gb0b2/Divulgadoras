
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { getAssignmentsForPromoterByEmail, confirmAssignment, submitJustification, scheduleProofPushReminder } from '../services/postService';
import { findPromotersByEmail, changePromoterEmail } from '../services/promoterService';
import { getActiveVipEvents, getAllVipMemberships } from '../services/vipService';
import { testSelfPush } from '../services/messageService';
import { PostAssignment, Promoter, VipMembership, VipEvent } from '../types';
import { 
    ArrowLeftIcon, CameraIcon, DownloadIcon, ClockIcon, 
    ExternalLinkIcon, CheckCircleIcon, WhatsAppIcon, MegaphoneIcon, 
    LogoutIcon, DocumentDuplicateIcon, SearchIcon, ChartBarIcon, 
    XIcon, FaceIdIcon, RefreshIcon, AlertTriangleIcon, PencilIcon, TicketIcon,
    SparklesIcon
} from '../components/Icons';
import StorageMedia from '../components/StorageMedia';
import { storage } from '../firebase/config';
import PromoterPublicStatsModal from '../components/PromoterPublicStatsModal';
import { initPushNotifications, clearPushListeners, PushStatus } from '../services/pushService';

const toDateSafe = (timestamp: any): Date | null => {
    if (!timestamp) return null;
    if (typeof timestamp.toDate === 'function') return timestamp.toDate();
    if (typeof timestamp === 'object' && timestamp.seconds !== undefined) return new Date(timestamp.seconds * 1000);
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) return date;
    return null;
};

const isHistoryAssignment = (assignment: PostAssignment): boolean => {
    if (assignment.proofSubmittedAt) return true;
    if (assignment.justificationStatus === 'accepted' || assignment.justificationStatus === 'rejected') return true;
    if (!assignment.post.isActive) return true;
    const now = new Date();
    const expiresAt = toDateSafe(assignment.post.expiresAt);
    if (expiresAt && now > expiresAt) {
        if (assignment.post.allowLateSubmissions) return false;
        if (assignment.status === 'confirmed' && assignment.confirmedAt) {
            const confirmedAt = toDateSafe(assignment.confirmedAt);
            if (confirmedAt) {
                const deadline = new Date(confirmedAt.getTime() + 24 * 60 * 60 * 1000);
                if (now < deadline) return false;
            }
        }
        return true;
    }
    return false;
};

const PostCard: React.FC<{ 
    assignment: PostAssignment & { promoterHasJoinedGroup: boolean }, 
    promoter: Promoter,
    onConfirm: (assignment: PostAssignment) => void, 
    onJustify: (assignment: PostAssignment) => void, 
    onRefresh: () => void 
}> = ({ assignment, promoter, onConfirm, onJustify, onRefresh }) => {
    const navigate = useNavigate();
    const [isConfirming, setIsConfirming] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);
    const [timeLeftForProof, setTimeLeftForProof] = useState('');
    const [isProofButtonEnabled, setIsProofButtonEnabled] = useState(false);
    const [countdownColor, setCountdownColor] = useState('text-gray-400');
    
    useEffect(() => {
        if (assignment.status !== 'confirmed' || !assignment.confirmedAt || assignment.proofSubmittedAt) return;
        
        const confirmationTime = toDateSafe(assignment.confirmedAt);
        // FIX: Fixed typo where confirmationTime was incorrectly referred to as countdownTime in some contexts.
        if (!confirmationTime) return;

        const expireTime = new Date(confirmationTime.getTime() + 24 * 60 * 60 * 1000);
        const calculatedEnableTime = new Date(confirmationTime.getTime() + 6 * 60 * 60 * 1000);

        const timer = setInterval(() => {
            const now = new Date();

            if (now > expireTime) {
                if (assignment.post.allowLateSubmissions) {
                    setTimeLeftForProof('Envio liberado (fora do prazo)');
                    setIsProofButtonEnabled(true);
                    setCountdownColor('text-yellow-500');
                } else {
                    setTimeLeftForProof('Prazo esgotado');
                    setIsProofButtonEnabled(false);
                    setCountdownColor('text-red-500');
                }
                clearInterval(timer);
                return;
            }

            if (assignment.post.allowImmediateProof) {
                const diff = expireTime.getTime() - now.getTime();
                setTimeLeftForProof(`Envio Liberado! Expira em: ${Math.floor(diff/3600000)}h ${Math.floor((diff/60000)%60)}m`);
                setIsProofButtonEnabled(true);
                setCountdownColor('text-green-400');
                return;
            }

            if (now < calculatedEnableTime) {
                const diff = calculatedEnableTime.getTime() - now.getTime();
                const h = Math.floor(diff / 3600000);
                const m = Math.floor