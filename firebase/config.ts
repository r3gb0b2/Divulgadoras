// Import the functions you need from the SDKs you need
import firebase from "firebase/compat/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
// FIX: Switched from modular to compat auth to resolve export errors.
import "firebase/compat/auth";
import { getFunctions } from "firebase/functions";

// TODO: Add your own Firebase configuration from your Firebase console
// ATENÇÃO: Substitua os valores abaixo pelas credenciais do SEU projeto no Firebase
// NUNCA compartilhe estas chaves publicamente.
const firebaseConfig = {
  apiKey: "AIzaSyDsi6VpfhLQW8UWgAp5c4TRV7vqOkDyauU",
  authDomain: "stingressos-e0a5f.firebaseapp.com",
  projectId: "stingressos-e0a5f",
  storageBucket: "stingressos-e0a5f.firebasestorage.app",
  messagingSenderId: "424186734009",
  appId: "1:424186734009:web:385f6c645a3ace2f784268",
  measurementId: "G-JTEQ46VCRY"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);

// Initialize Cloud Firestore and get a reference to the service
export const firestore = getFirestore(app);

// Initialize Cloud Storage and get a reference to the service
export const storage = getStorage(app);

// Initialize Firebase Authentication and get a reference to the service
// FIX: Use the compat auth() method instead of modular getAuth().
export const auth = firebase.auth();

// Initialize Firebase Functions and get a reference to the service
export const functions = getFunctions(app, 'southamerica-east1');