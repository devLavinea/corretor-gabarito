import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyByOiwczQJAxwIqa4nxGuA1qu1GHxCGQ7c",
  authDomain: "corretor-gabarito-professores.firebaseapp.com",
  projectId: "corretor-gabarito-professores",
  storageBucket: "corretor-gabarito-professores.firebasestorage.app",
  messagingSenderId: "843971692274",
  appId: "1:843971692274:web:0100bac19b317159b9f26b",
  measurementId: "G-V6T5CT0FCY",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
