import React, { useState, useEffect } from 'react';
import { storage } from '../firebase/config';

// Helper to extract Google Drive file ID from various URL formats
const extractGoogleDriveId = (url: string): string | null => {
    let id = null;
    const patterns = [
        /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
        /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
        /drive\.google\.com\/uc\?id=([a-zA-Z0-9_-]+)/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            id = match[1];
            break;
        }
    }
    return id;
};


interface StorageMediaProps {
    path: string;
    type: 'image' | 'video';
    className?: string;
    alt?: string;
    controls?: boolean;
}

const StorageMedia: React.FC<StorageMediaProps> = ({ path, type, ...props }) => {
    const [url, setUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        setUrl(null);
        setError(null);

        if (path) {
            // Check if it's a full URL
            if (path.startsWith('http') || path.startsWith('blob:')) {
                if (path.includes('drive.google.com')) {
                    const fileId = extractGoogleDriveId(path);
                    if (fileId) {
                         // Use the embed preview URL for videos
                        if (isMounted) setUrl(`https://drive.google.com/file/d/${fileId}/preview`);
                    } else {
                        if (isMounted) setError('Link do Google Drive inválido.');
                    }
                } else {
                    // For other http links like blob previews or existing Firebase URLs
                    if (isMounted) setUrl(path);
                }
                return;
            }

            // If it's not a full URL, assume it's a Firebase Storage path
            const storageRef = storage.ref(path);
            storageRef.getDownloadURL()
                .then(downloadUrl => {
                    if (isMounted) {
                        setUrl(downloadUrl);
                    }
                })
                .catch(err => {
                    console.error("Failed to get download URL for path:", path, err);
                    if (isMounted) {
                        setError("Mídia não encontrada.");
                    }
                });
        }
        return () => { isMounted = false; };
    }, [path]);

    if (error) {
        return <div className="text-red-400 text-xs p-2 bg-red-900/50 rounded">{error}</div>;
    }

    if (!url) {
        return (
            <div className="flex items-center justify-center bg-gray-800 rounded-md h-32 w-full">
                 <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (type === 'image') {
        return <img src={url} alt={props.alt || 'Mídia'} {...props} />;
    }

    if (type === 'video') {
        // Use an iframe for Google Drive embeds for better compatibility
        if (url.includes('drive.google.com')) {
            return <iframe src={url} allow="autoplay" {...props} ></iframe>
        }
        // Fallback to video tag for other video URLs
        return <video src={url} controls={props.controls !== false} {...props} />;
    }

    return null;
};

export default StorageMedia;