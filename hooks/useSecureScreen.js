/**
 * useSecureScreen : protège un écran sensible contre les captures.
 *
 * CIBLÉ, PAS GLOBAL : seuls les écrans qui affichent une pièce du livreur
 * (identité, permis, documents d'inscription), des coordonnées bancaires
 * ou un mot de passe l'appellent. Le reste de l'app reste capturable
 * (carte, commandes, gains), ce qui sert au livreur pour le support.
 *
 *  - Android : FLAG_SECURE. Capture bloquée, écran noir dans
 *    l'enregistrement et dans la liste des applications récentes.
 *  - iOS : le système ne permet pas d'interdire une capture d'écran ;
 *    le module masque ce qu'il peut (enregistrement de l'écran).
 *
 * Protection active seulement quand l'écran a le FOCUS : les onglets et les
 * piles gardent les écrans montés, un simple montage laisserait FLAG_SECURE
 * sur la carte ou les commandes après un changement d'onglet. Hors
 * navigateur (pas de contexte de navigation), l'écran est considéré visible.
 * Chaque instance a sa propre clé : le même écran monté dans deux piles
 * (Portefeuille) ne retire pas la protection de l'autre.
 *
 * IMPORTANT, chargement DÉFENSIF : des mises à jour OTA tournent sur des binaires qui
 * ne contiennent pas `expo-screen-capture`. Sans le module natif, le hook est
 * inerte au lieu de faire planter l'écran.
 */
import { useContext, useEffect, useId, useState } from 'react';
import { NavigationContext } from '@react-navigation/native';

let ScreenCapture = null;
try {
  const mod = require('expo-screen-capture');
  ScreenCapture = mod && typeof mod.preventScreenCaptureAsync === 'function' ? mod : mod?.default || null;
} catch {
  ScreenCapture = null;
}

const isReady = () =>
  !!(ScreenCapture && typeof ScreenCapture.preventScreenCaptureAsync === 'function');

/**
 * @param {string} tag Nom de l'écran, clé de la protection.
 * @param {boolean} [enabled=true] Permet de conditionner la protection.
 */
export default function useSecureScreen(tag, enabled = true) {
  const navigation = useContext(NavigationContext);
  const instance = useId();
  const [focused, setFocused] = useState(() =>
    typeof navigation?.isFocused === 'function' ? navigation.isFocused() : true
  );

  useEffect(() => {
    if (!navigation || typeof navigation.addListener !== 'function') return undefined;
    const offFocus = navigation.addListener('focus', () => setFocused(true));
    const offBlur = navigation.addListener('blur', () => setFocused(false));
    if (typeof navigation.isFocused === 'function') setFocused(navigation.isFocused());
    return () => {
      offFocus?.();
      offBlur?.();
    };
  }, [navigation]);

  const active = enabled && focused;
  const key = `${tag}:${instance}`;

  useEffect(() => {
    if (!active || !isReady()) {
      return undefined;
    }

    Promise.resolve()
      .then(() => ScreenCapture.preventScreenCaptureAsync(key))
      .catch(() => {
        // Module présent mais natif absent ou en erreur : l'écran doit s'afficher.
      });

    return () => {
      Promise.resolve()
        .then(() => ScreenCapture.allowScreenCaptureAsync?.(key))
        .catch(() => {});
    };
  }, [key, active]);
}
