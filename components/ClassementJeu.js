/**
 * Classement du mini-jeu « Tri express » : top 20 des livreurs (prénom et
 * initiale du nom seulement), la ligne du livreur mise en avant, et son rang
 * s'il est hors du top 20. Affiché par-dessus le jeu, qui reste en pause.
 *
 * `avantChargement` : envoi éventuel du record en attente, pour que le rang
 * affiché soit à jour (ses erreurs sont ignorées).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { deliveryService } from '../services/deliveryService';
import { BRAND } from '../contexts/ThemeContext';

const MEDAILLES = { 1: '#F2B705', 2: '#A7B1BC', 3: '#CD7F32' };

export default function ClassementJeu({ t, colors, dark, onFermer, avantChargement }) {
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);
  const [etat, setEtat] = useState({ charge: true, erreur: false, liste: [], moi: null });
  const monte = useRef(true);
  useEffect(() => () => { monte.current = false; }, []);

  const charger = useCallback(async () => {
    setEtat((e) => ({ ...e, charge: true, erreur: false }));
    try {
      if (avantChargement) await avantChargement().catch(() => {});
      const data = await deliveryService.getClassementJeu();
      if (!monte.current) return;
      setEtat({
        charge: false,
        erreur: false,
        liste: Array.isArray(data?.classement) ? data.classement : [],
        moi: data?.moi && typeof data.moi === 'object' ? data.moi : null,
      });
    } catch {
      if (monte.current) setEtat((e) => ({ ...e, charge: false, erreur: true }));
    }
  }, [avantChargement]);

  useEffect(() => { charger(); }, [charger]);

  const moiDansTop = etat.liste.some((l) => l.moi);

  return (
    <View style={styles.carte}>
      <View style={styles.entete}>
        <Ionicons name="podium" size={26} color={BRAND} />
        <Text style={styles.titre}>{t('jeuClassement')}</Text>
        <Pressable onPress={onFermer} hitSlop={10} style={styles.fermer} accessibilityLabel={t('jeuFermer')}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
      </View>

      {etat.charge && (
        <View style={styles.centre}>
          <ActivityIndicator color={BRAND} />
        </View>
      )}

      {!etat.charge && etat.erreur && (
        <View style={styles.centre}>
          <Ionicons name="cloud-offline-outline" size={36} color={colors.textMuted} />
          <Text style={styles.texte}>{t('jeuClassementHorsLigne')}</Text>
          <Pressable onPress={charger} style={({ pressed }) => [styles.bouton, pressed && { opacity: 0.8 }]}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.boutonTexte}>{t('jeuReessayer')}</Text>
          </Pressable>
        </View>
      )}

      {!etat.charge && !etat.erreur && etat.liste.length === 0 && (
        <View style={styles.centre}>
          <Ionicons name="trophy-outline" size={36} color={MEDAILLES[1]} />
          <Text style={styles.titreVide}>{t('jeuClassementVide')}</Text>
          <Text style={styles.texte}>{t('jeuClassementVideTexte')}</Text>
        </View>
      )}

      {!etat.charge && !etat.erreur && etat.liste.length > 0 && (
        <>
          <ScrollView style={styles.liste} contentContainerStyle={{ paddingBottom: 4 }}>
            {etat.liste.map((l) => (
              <Ligne key={`${l.rang}-${l.nom}`} l={l} t={t} styles={styles} />
            ))}
          </ScrollView>
          {!moiDansTop && etat.moi && (
            <View style={styles.votreRang}>
              <Text style={styles.votreRangTexte}>{t('jeuVotreRang', { n: etat.moi.rang })}</Text>
              <Text style={styles.texteDiscret}>
                {t('jeuNiveauCourt', { n: etat.moi.niveau })} · {t('jeuScore', { n: etat.moi.score })}
              </Text>
            </View>
          )}
          {!moiDansTop && !etat.moi && (
            <Text style={[styles.texteDiscret, { marginTop: 10 }]}>{t('jeuClassementPasJoue')}</Text>
          )}
        </>
      )}
      <Text style={[styles.texteDiscret, { marginTop: 10 }]}>{t('jeuClassementInfo')}</Text>
    </View>
  );
}

function Ligne({ l, t, styles }) {
  const medaille = MEDAILLES[l.rang];
  return (
    <View style={[styles.ligne, l.moi && styles.ligneMoi]}>
      <View style={styles.rang}>
        {medaille
          ? <Ionicons name="medal" size={22} color={medaille} />
          : <Text style={styles.rangTexte}>{l.rang}</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.nomLigne}>
          <Text style={styles.nom} numberOfLines={1}>{l.nom}</Text>
          {l.moi && (
            <View style={styles.pastille}>
              <Text style={styles.pastilleTexte}>{t('jeuVous')}</Text>
            </View>
          )}
        </View>
        <Text style={styles.texteDiscretGauche}>{t('jeuNiveauCourt', { n: l.niveau })}</Text>
      </View>
      <Text style={styles.score}>{l.score}</Text>
    </View>
  );
}

const makeStyles = (c, dark) => StyleSheet.create({
  carte: {
    width: '100%', maxWidth: 400, maxHeight: '88%', backgroundColor: c.card, borderRadius: 20, padding: 18,
  },
  entete: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  titre: { flex: 1, color: c.text, fontSize: 20, fontWeight: '800' },
  fermer: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: c.border,
  },
  centre: { alignItems: 'center', paddingVertical: 24 },
  titreVide: { color: c.text, fontSize: 18, fontWeight: '800', marginTop: 10, textAlign: 'center' },
  texte: { color: c.textSoft, fontSize: 15, marginTop: 8, textAlign: 'center', lineHeight: 21 },
  texteDiscret: { color: c.textMuted, fontSize: 13, marginTop: 4, textAlign: 'center' },
  texteDiscretGauche: { color: c.textMuted, fontSize: 12, marginTop: 2 },
  bouton: {
    flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 14, backgroundColor: BRAND,
    borderRadius: 14, paddingVertical: 12, paddingHorizontal: 22,
  },
  boutonTexte: { color: '#fff', fontSize: 16, fontWeight: '700' },
  liste: { flexGrow: 0 },
  ligne: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 10,
    borderRadius: 12, borderWidth: 1, borderColor: 'transparent', marginBottom: 4,
  },
  ligneMoi: { borderColor: BRAND, borderWidth: 2, backgroundColor: dark ? 'transparent' : '#FFF6F0' },
  rang: { width: 30, alignItems: 'center' },
  rangTexte: { color: c.textSoft, fontSize: 15, fontWeight: '700' },
  nomLigne: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nom: { color: c.text, fontSize: 15, fontWeight: '700', flexShrink: 1 },
  pastille: { backgroundColor: BRAND, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  pastilleTexte: { color: '#fff', fontSize: 11, fontWeight: '700' },
  score: { color: c.text, fontSize: 16, fontWeight: '800' },
  votreRang: {
    marginTop: 8, paddingVertical: 10, borderRadius: 12, borderWidth: 2, borderColor: BRAND, alignItems: 'center',
  },
  votreRangTexte: { color: c.text, fontSize: 15, fontWeight: '800' },
});
