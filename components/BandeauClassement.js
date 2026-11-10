/**
 * Bandeau haut TOUJOURS visible pendant la partie : à gauche le rang et le
 * record du joueur sur ce jeu (« Vous : 12e · record 1 840 » ou « Pas encore
 * classé »), à droite le premier du classement (« TOP 1 : Karim B. · 5 200 »).
 * Mis à jour en direct : « Nouveau record ! » dès que le score passe le
 * record, « Vous êtes TOP 1 » dès qu'il passe le premier.
 *
 *   <BandeauClassement
 *     jeu="coupe" idLivreur={user?.id} score={score}
 *     rafraichir={nbParties}   // à incrémenter après finDePartie()
 *     t={t} colors={colors} style={{ marginTop: 6 }}
 *   />
 *
 * Données : deliveryService.getClassementJeux(jeu) (top + moi), chargées à
 * l'ouverture et à chaque changement de `rafraichir`, gardées en cache local
 * (AsyncStorage) pour l'affichage hors ligne ; le record local
 * (utils/jeuxRecords.js) complète quand le serveur n'a pas encore le score.
 * Compact (une ligne de 30 pt), ne capte pas le toucher.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { deliveryService } from '../services/deliveryService';
import { chargerRecord } from '../utils/jeuxRecords';

const OR = '#F2B705';
const VERT = '#16A34A';

export function formaterNombre(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function cleCache(jeu, id) {
  return `pearl_jeux_bandeau_v1_${jeu}_${id != null && id !== '' ? String(id) : 'local'}`;
}

/** Données du bandeau : { rang, record, top: { nom, score } | null, pret }. */
export function useDonneesBandeau(jeu, idLivreur, rafraichir) {
  const [d, setD] = useState({ rang: null, record: 0, top: null, pret: false });
  const monte = useRef(true);
  useEffect(() => () => { monte.current = false; }, []);

  useEffect(() => {
    let vivant = true;
    (async () => {
      let local = 0;
      try { local = (await chargerRecord(jeu, idLivreur)).meilleur; } catch { /* rien */ }
      // 1) cache local pour un affichage immédiat, même hors ligne
      try {
        const brut = await AsyncStorage.getItem(cleCache(jeu, idLivreur));
        if (brut && vivant && monte.current) {
          const c = JSON.parse(brut);
          setD({ rang: c.rang ?? null, record: Math.max(Number(c.record) || 0, local), top: c.top || null, pret: true });
        } else if (vivant && monte.current) {
          setD((x) => ({ ...x, record: Math.max(x.record, local), pret: true }));
        }
      } catch { /* rien */ }
      // 2) serveur
      try {
        const data = await deliveryService.getClassementJeux(jeu);
        if (!vivant || !monte.current) return;
        const liste = Array.isArray(data?.classement) ? data.classement : [];
        const premier = liste[0] ? { nom: String(liste[0].nom || ''), score: Number(liste[0].score) || 0 } : null;
        const moi = data?.moi && typeof data.moi === 'object' ? data.moi : (liste.find((l) => l.moi) || null);
        const serveur = moi ? Number(moi.score) || 0 : 0;
        const suivant = {
          rang: moi ? Number(moi.rang) || null : null,
          record: Math.max(serveur, local),
          top: premier,
          pret: true,
        };
        setD(suivant);
        AsyncStorage.setItem(cleCache(jeu, idLivreur), JSON.stringify(suivant)).catch(() => {});
      } catch {
        // Hors ligne : on garde le cache.
      }
    })();
    return () => { vivant = false; };
  }, [jeu, idLivreur, rafraichir]);

  return d;
}

function BandeauClassement({ jeu, idLivreur, score = 0, rafraichir = 0, t, colors, style }) {
  const d = useDonneesBandeau(jeu, idLivreur, rafraichir);
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const s = Math.floor(Number(score) || 0);
  const nouveauRecord = s > 0 && s > d.record;
  const top1 = s > 0 && d.pret && (d.top ? s > d.top.score : true);

  let gauche;
  if (nouveauRecord) gauche = t('jeuxBandeauNouveauRecord');
  else if (d.record <= 0 && d.rang == null) gauche = t('jeuxBandeauPasClasse');
  else {
    const rang = d.rang == null ? '' : (d.rang === 1 ? t('jeuxRang1') : t('jeuxRang', { n: d.rang }));
    gauche = rang
      ? t('jeuxBandeauVous', { rang, n: formaterNombre(d.record) })
      : t('jeuxBandeauVousSansRang', { n: formaterNombre(d.record) });
  }
  let droite = null;
  if (top1) droite = t('jeuxBandeauTop1Vous');
  else if (d.top) droite = t('jeuxBandeauTop', { nom: d.top.nom, n: formaterNombre(d.top.score) });

  return (
    <View pointerEvents="none" style={[styles.ligne, style]}>
      <View style={[styles.pastille, nouveauRecord && styles.vert]}>
        <Ionicons name={nouveauRecord ? 'trophy' : 'person'} size={13} color={nouveauRecord ? '#fff' : colors.textSoft} />
        <Text style={[styles.texte, nouveauRecord && styles.blanc]} numberOfLines={1}>{gauche}</Text>
      </View>
      {droite != null && (
        <View style={[styles.pastille, top1 && styles.vert]}>
          <Ionicons name="trophy" size={13} color={top1 ? '#fff' : OR} />
          <Text style={[styles.texte, top1 && styles.blanc]} numberOfLines={1}>{droite}</Text>
        </View>
      )}
    </View>
  );
}

const makeStyles = (c) => StyleSheet.create({
  ligne: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  pastille: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: 9, borderRadius: 15,
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
  },
  vert: { backgroundColor: VERT, borderColor: VERT },
  texte: { flex: 1, color: c.text, fontSize: 12, fontWeight: '800' },
  blanc: { color: '#fff' },
});

export default React.memo(BandeauClassement);
