import {
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithPopup,
    signOut
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";

const ALLOWED_EMAIL_DOMAIN = "bold.co";

export { onAuthStateChanged, signOut };

export function usuarioAutorizado(user) {
    const email = user?.email?.trim().toLowerCase();
    return Boolean(user?.emailVerified && email?.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`));
}

export async function iniciarSesionGoogle(auth) {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ hd: ALLOWED_EMAIL_DOMAIN, prompt: "select_account" });
    return signInWithPopup(auth, provider);
}

export function mensajeErrorAcceso(error) {
    if (error.code === "auth/unauthorized-domain") {
        return "Este dominio del sitio no está autorizado en Firebase Authentication.";
    }
    if (error.code === "auth/popup-blocked") {
        return "El navegador bloqueó la ventana de Google. Permite las ventanas emergentes e inténtalo de nuevo.";
    }
    if (error.code === "auth/popup-closed-by-user") {
        return "Se cerró la ventana de inicio de sesión antes de completar el acceso.";
    }
    return "No se pudo completar el acceso con Google. Verifica Firebase Authentication e inténtalo de nuevo.";
}
