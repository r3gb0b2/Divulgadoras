    const handleLookupPromoter = async (emailToSearch?: string) => {
        const email = emailToSearch || lookupEmail;
        if (!email.trim()) return;
        setIsLookingUp(true);
        setLookupError(null);
        setLookupResults(null);
        setIsLookupModalOpen(true);
        try {
            const results = await findPromotersByEmail(email.trim());
            setLookupResults(results);
        } catch (err: any) {
            let errorMessage = "Ocorreu um erro desconhecido";
            if (err instanceof Error) {
                errorMessage = err.message;
            } else if (typeof err === 'object' && err !== null && 'message' in err) {
                errorMessage = String((err as any).message);
            } else {
                errorMessage = String(err);
            }
            setLookupError(errorMessage);
        } finally {
            setIsLookingUp(false);
        }
    };