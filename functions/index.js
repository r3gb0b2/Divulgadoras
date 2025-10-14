const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();

// Set the region for all functions in this file
setGlobalOptions({ region: "southamerica-east1" });

// The file is kept for future backend logic, but email functions are removed.
