import React, { useState, useEffect, useCallback } from 'react';
import { DownloadIcon } from './Icons';
import { storage } from '../firebase/config';

interface PhotoViewerModalProps {
  imageUrls: string[];
  startIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

// FIX: Changed to a named export to resolve a module resolution error.
export const PhotoViewerModal: React.FC<PhotoViewerModalProps> = ({ imageUrls, startIndex, isOpen, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [downloadableUrl, setDownloadableUrl] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
        setCurrentIndex(startIndex);
    }
  }, [isOpen, startIndex]);

  // Effect to generate a fresh, valid URL for the current image
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setDownloadableUrl(null); // Reset on image change

    const generateUrl = async () => {
        const originalUrl = imageUrls[currentIndex];
        if (!originalUrl) return;

        // If it's a Firebase Storage URL, it might be expired. Let's get a fresh one.
        if (originalUrl.includes('firebasestorage.googleapis.com')) {
            try {
                // This is a simplified way to get the path. A more robust way might be needed if URLs change.
                const urlObject = new URL(originalUrl);
                const pathName = urlObject.pathname;
                // Path is like /v0/b/bucket-name.appspot.com/o/path%2Fto%2Ffile.jpg
                const pathStartIndex = pathName.indexOf('/o/');
                
                if (pathStartIndex !== -1) {
                    const encodedPath = pathName.substring(pathStartIndex + 3);
                    // Remove query params like token before decoding
                    const decodedPath = decodeURIComponent(encodedPath.split('?')[0]); 
                    
                    const storageRef = storage.ref(decodedPath);
                    const freshUrl = await storageRef.getDownloadURL();
                    if (isMounted) setDownloadableUrl(freshUrl);
                } else {
                     if (isMounted) setDownloadableUrl(originalUrl); // Fallback if path parsing fails
                }
            } catch (e) {
                console.warn("Could not generate a fresh download URL, falling back to the original URL.", e);
                if (isMounted) setDownloadableUrl(originalUrl); // Fallback on error
            }
        } else {
            // Not a firebase URL (e.g., blob URL), use as is.
            if (isMounted) setDownloadableUrl(originalUrl);
        }
    };

    generateUrl();

    return () => { isMounted = false; };
  }, [isOpen, currentIndex, imageUrls]);


  const goToPrevious = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (imageUrls.length <= 1) return;
    const isFirstSlide = currentIndex === 0;
    const newIndex = isFirstSlide ? imageUrls.length - 1 : currentIndex - 1;
    setCurrentIndex(newIndex);
  }, [currentIndex, imageUrls.length]);

  const goToNext = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (imageUrls.length <= 1) return;
    const isLastSlide = currentIndex === imageUrls.length - 1;
    const newIndex = isLastSlide ? 0 : currentIndex + 1;
    setCurrentIndex(newIndex);
  }, [currentIndex, imageUrls.length]);
  
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'ArrowRight') goToNext(e as any);
      else if (e.key === 'ArrowLeft') goToPrevious(e as any);
      else if (e.key === 'Escape') onClose();
  }, [isOpen, goToNext, goToPrevious, onClose]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  if (!isOpen || !imageUrls || imageUrls.length === 0) {
    return null;
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const hasMultipleImages = imageUrls.length > 1;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex justify-center items-center z-50 p-2" onClick={handleBackdropClick} role="dialog" aria-modal="true">
        <div className="relative w-full max-w-2xl max-h-[95vh] flex flex-col items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {/* Image Area */}
            <div className="relative w-full flex-grow min-h-0 flex items-center justify-center">
                <img src={imageUrls[currentIndex]} alt={`Visualização ${currentIndex + 1}`} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"/>
            </div>
            
            {/* Bottom Control Bar */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                {hasMultipleImages && (
                    <p className="text-center text-white text-sm font-mono mb-2">{currentIndex + 1} / {imageUrls.length}</p>
                )}
                <div className="flex items-center justify-center gap-4 sm:gap-6 text-white">
                    <button onClick={goToPrevious} disabled={!hasMultipleImages} className="p-2 rounded-full bg-black/50 hover:bg-black/70 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <a href={downloadableUrl || '#'} download target="_blank" rel="noopener noreferrer" className={`p-3 rounded-full bg-black/50 hover:bg-black/70 ${!downloadableUrl ? 'opacity-30 cursor-not-allowed' : ''}`} title="Baixar imagem">
                        <DownloadIcon className="h-6 w-6" />
                    </a>
                    <button onClick={onClose} className="px-6 py-2 bg-red-600 text-white font-semibold rounded-full hover:bg-red-700 transition-colors">
                        Fechar
                    </button>
                    <a href={imageUrls[currentIndex]} target="_blank" rel="noopener noreferrer" className="p-3 rounded-full bg-black/50 hover:bg-black/70" title="Abrir em nova aba">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    </a>
                    <button onClick={goToNext} disabled={!hasMultipleImages} className="p-2 rounded-full bg-black/50 hover:bg-black/70 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                </div>
            </div>
        </div>
    </div>
  );
};

export default PhotoViewerModal;
