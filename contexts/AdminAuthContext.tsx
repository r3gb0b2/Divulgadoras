import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
// FIX: Switched from modular to compat auth to resolve export errors.
import firebase from 'firebase/compat/app';
import { auth } from '../firebase/config';
import { getAdminUserData } from '../services/adminService';
import { AdminUserData } from '../types';

interface AdminAuthContextType {
    // FIX: Use compat User type.
    user: firebase.User | null;
    adminData: AdminUserData | null;
    loading: boolean;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export const AdminAuthProvider: React.FC<{children: ReactNode}> = ({ children }) => {
    // FIX: Use compat User type.
    const [user, setUser] = useState<firebase.User | null>(null);
    const [adminData, setAdminData] = useState<AdminUserData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // FIX: Use compat onAuthStateChanged method.
        const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
            setLoading(true);
            if (firebaseUser) {
                // Force a token refresh to get latest custom claims on load
                await firebaseUser.getIdToken(true);
                setUser(firebaseUser);
                
                sessionStorage.setItem('isAdminAuthenticated', 'true');
                try {
                    // Use UID for secure data retrieval
                    let data = await getAdminUserData(firebaseUser.uid);

                    // If no admin data is found, check if it's the default superadmin email.
                    // If so, create their admin record on the fly for the first login.
                    // This superadmin has no organizationId and can see everything.
                    if (!data && firebaseUser.email === 'r3gb0b@gmail.com') {
                        // This initial creation is now handled by a secure cloud function.
                        // For simplicity in this context, we assume the document will be created
                        // and we re-fetch it. A more robust solution might call a function here.
                        // The user will need to have their claims set by a Super Admin.
                        // For first time ever, this might need manual setup in Firestore.
                        // The user will be stuck without a role until one is set.
                        console.warn("Superadmin document not found in Firestore. It must be created, and claims set.");
                    }

                    setAdminData(data);
                } catch (error) {
                    console.error("Failed to fetch admin data", error);
                    setAdminData(null); // Ensure no stale data on error
                }
            } else {
                setUser(null);
                setAdminData(null);
                sessionStorage.removeItem('isAdminAuthenticated');
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    return (
        <AdminAuthContext.Provider value={{ user, adminData, loading }}>
            {children}
        </AdminAuthContext.Provider>
    );
};

export const useAdminAuth = (): AdminAuthContextType => {
    const context = useContext(AdminAuthContext);
    if (context === undefined) {
        throw new Error('useAdminAuth must be used within an AdminAuthProvider');
    }
    return context;
};