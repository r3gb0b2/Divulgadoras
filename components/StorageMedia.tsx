import React, { useState, useEffect } from 'react';
import { ref, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase/config';

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
        if (path) {
            // Check if it's already a full URL (for previews of unsaved files)
            if (path.startsWith('http') || path.startsWith('blob:')) {
                setUrl(path);
                return;
            }

            const storageRef = ref(storage, path);
            getDownloadURL(storageRef)
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
        return <video src={url} controls={props.controls !== false} {...props} />;
    }

    return null;
};

export default StorageMedia;
