/**
 * Suivi des récompenses d'une partie (Slalom, Pile, Tournée).
 *
 *   const rec = useRecompenses({score, enPartie, meilleurScore, lireMaxMois, surAnnonce});
 *   rec.debut();            // au lancement d'une nouvelle partie
 *   rec.recap(scoreFinal);  // {etoiles, record, gainRecord, gainMois, meilleurMois}
 *
 * - Pendant la partie, `surAnnonce({type: 'palier', n})` quand le score passe
 *   un palier (PALIERS) et `surAnnonce({type: 'record'})` une seule fois quand
 *   il dépasse le record d'avant la partie.
 * - `debut()` retient le record et le meilleur score du mois d'avant la
 *   partie ; sans appel (partie reprise), ils sont pris à la première image de jeu.
 * - Aucun état React : tout vit dans des refs, aucun rendu en plus.
 */
import {useCallback, useEffect, useRef} from 'react';
import {entierJeu} from './commun';

export const PALIERS = [250, 500, 1000, 2000, 3000, 5000, 7500, 10000, 15000, 20000, 30000, 50000, 75000, 100000];

/** Plus haut palier franchi entre deux scores, null sinon. */
export function palierFranchi(avant, apres) {
  let p = null;
  for (let i = 0; i < PALIERS.length; i += 1) {
    if (PALIERS[i] > avant && PALIERS[i] <= apres) p = PALIERS[i];
  }
  return p;
}

/** Étoiles d'une partie : 3 au record (ou première partie), 2 à 60 % du record, 1 sinon. */
export function etoilesScore(score, recordAvant) {
  const s = entierJeu(score);
  const r = entierJeu(recordAvant);
  if (s <= 0) return 0;
  if (r <= 0 || s > r) return 3;
  return s >= r * 0.6 ? 2 : 1;
}

export default function useRecompenses({score = 0, enPartie = false, meilleurScore = 0, lireMaxMois, surAnnonce}) {
  const base = useRef({record: null, mois: null, dernier: 0, annonceRecord: false});
  const annonceRef = useRef(surAnnonce);
  annonceRef.current = surAnnonce;
  const lireRef = useRef(lireMaxMois);
  lireRef.current = lireMaxMois;
  const meilleurRef = useRef(meilleurScore);
  meilleurRef.current = meilleurScore;

  const debut = useCallback((scoreDepart = 0) => {
    const b = base.current;
    b.record = entierJeu(meilleurRef.current);
    b.mois = null;
    b.dernier = entierJeu(scoreDepart);
    b.annonceRecord = false;
    const lire = lireRef.current;
    if (lire) {
      Promise.resolve(lire())
        .then(m => {
          if (base.current === b && b.mois == null && m != null) b.mois = entierJeu(m);
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!enPartie) return;
    const b = base.current;
    const s = entierJeu(score);
    if (b.record == null) {
      debut(s);
      // Partie reprise : le score déjà fait ne compte pas comme un dépassement.
      b.annonceRecord = s >= b.record;
      return;
    }
    if (s > b.dernier) {
      const p = palierFranchi(b.dernier, s);
      const record = !b.annonceRecord && b.record > 0 && s > b.record;
      if (record) {
        b.annonceRecord = true;
        annonceRef.current?.({type: 'record'});
      } else if (p) {
        annonceRef.current?.({type: 'palier', n: p});
      }
    }
    b.dernier = s;
  }, [score, enPartie, debut]);

  const recap = useCallback(scoreFinal => {
    const b = base.current;
    const s = entierJeu(scoreFinal);
    const recordAvant = b.record == null ? entierJeu(meilleurRef.current) : b.record;
    const mois = b.mois;
    return {
      etoiles: etoilesScore(s, recordAvant),
      record: recordAvant > 0 && s > recordAvant,
      gainRecord: Math.max(0, s - recordAvant),
      gainMois: mois == null ? null : Math.max(0, s - mois),
      meilleurMois: mois == null ? null : Math.max(s, mois),
    };
  }, []);

  return {debut, recap};
}
