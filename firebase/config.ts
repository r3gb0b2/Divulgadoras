// Import the functions you need from the SDKs you need
import firebase from "firebase/compat/app";
// Import compat services
import "firebase/compat/auth";
import "firebase/compat/firestore";
import "firebase/compat/storage";
import "firebase/compat/functions";


// TODO: Add your own Firebase configuration from your Firebase console
// ATENÇÃO: Substitua os valores abaixo pelas credenciais do SEU projeto no Firebase
// NUNCA compartilhe estas chaves publicamente.
const firebaseConfig = {
  apiKey: "AIzaSyDsi6VpfhLQW8UWgAp5c4TRV7vqOkDyauU",
  authDomain: "stingressos-e0a5f.firebaseapp.com",
  projectId: "stingressos-e0a5f",
  storageBucket: "stingressos-e0a5f.appspot.com",
  messagingSenderId: "424186734009",
  appId: "1:424186734009:web:385f6c645a3ace2f784268",
  measurementId: "G-JTEQ46VCRY"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);

// Initialize Cloud Firestore and get a reference to the service using compat syntax
export const firestore = firebase.firestore();

// Initialize Cloud Storage and get a reference to the service using compat syntax
export const storage = firebase.storage();

// Initialize Firebase Authentication and get a reference to the service
export const auth = firebase.auth();

// Initialize Firebase Functions and get a reference to the service using compat syntax
export const functions = app.functions('southamerica-east1');