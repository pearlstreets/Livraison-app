/**
 * Classement du mois, tous mini-jeux confondus (écran Mini-jeux).
 *
 *   <ClassementMois etat={etat} onRecharger={charger} />
 *
 * `etat` : {charge, erreur, donnees} où `donnees` est la réponse de
 * GET driver/jeux/classement-mois/ (deliveryService.getClassementMoisJeux). Encart :
 * top 3 avec médailles, rang et points du livreur, temps restant avant la fin du mois,
 * bouton qui ouvre la modale du classement complet (top 20). Livreur : toujours
 * connecté, ni invitation ni lot (gains bloqués). Erreur réseau : une ligne
 * discrète et Réessayer, jamais de bandeau. La modale montre aussi le
 * palmarès gardé pour toujours (`palmares` : records et 1res places).
 */
import React, {useCallback, useState} from 'react';
import {ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useLanguage} from '../../contexts/LanguageContext';
import {COULEURS_JEUX as C, JEUX, useCompteJeu, entierJeu} from '../../utils/jeux/commun';
import {finMoisParis} from '../../utils/jeux/useEnvoiRecord';

// Gains du top 3 ouverts à partir de janvier 2027 (classement seul avant).
// Le serveur fait foi (`gains_actifs`) ; sans réponse (non connecté), date.
const DEBUT_GAINS = Date.parse('2027-01-01T00:00:00+01:00');
export function gainsOuverts(donnees) {
  if (typeof donnees?.gains_actifs === 'boolean') {
    return donnees.gains_actifs;
  }
  return Date.now() >= DEBUT_GAINS;
}

export const MEDAILLES = {1: '#F2B705', 2: '#A7B1BC', 3: '#CD7F32'};

/** Lignes du classement, nettoyées. */
export function lignesClassement(donnees) {
  return Array.isArray(donnees?.classement)
    ? donnees.classement.filter(l => l && typeof l === 'object')
    : [];
}

/** Temps restant avant la fin du mois, en texte. */
function texteTempsRestant(t, finIso) {
  let fin = finIso ? Date.parse(finIso) : NaN;
  if (!Number.isFinite(fin)) fin = finMoisParis();
  const reste = fin - Date.now();
  if (reste <= 0) return t('moisFinImminente');
  const heures = Math.floor(reste / 3600000);
  const jours = Math.floor(heures / 24);
  if (jours >= 2) return t('moisFinDansJours', {n: jours});
  if (jours === 1) return t('moisFinDansUnJour');
  if (heures >= 2) return t('moisFinDansHeures', {n: heures});
  return t('moisFinImminente');
}

export default function ClassementMois({etat, onRecharger}) {
  const {t} = useLanguage();
  const {connecte} = useCompteJeu();
  const [ouvert, setOuvert] = useState(false);
  const donnees = etat?.donnees;
  const liste = lignesClassement(donnees);
  const moi = donnees?.moi && typeof donnees.moi === 'object' ? donnees.moi : null;
  const moiDansTop3 = liste.slice(0, 3).some(l => l.moi);

  const ouvrir = useCallback(() => {
    setOuvert(true);
    onRecharger?.();
  }, [onRecharger]);

  return (
    <View style={styles.carte}>
      <View style={styles.entete}>
        <Ionicons name="trophy" size={22} color={C.or} />
        <Text style={styles.titre}>{t('moisTitreTousJeux')}</Text>
      </View>
      <View style={styles.pastilleTemps}>
        <Ionicons name="time-outline" size={14} color={C.texteDoux} />
        <Text style={styles.pastilleTempsTexte}>{texteTempsRestant(t, donnees?.fin)}</Text>
      </View>

      {connecte && etat?.charge && !donnees && (
        <View style={styles.centre}>
          <ActivityIndicator color={C.marque} />
        </View>
      )}

      {connecte && !etat?.charge && etat?.erreur && !donnees && (
        <View style={styles.horsLigne}>
          <Text style={[styles.texteDiscret, {flex: 1}]}>{t('moisHorsLigne')}</Text>
          <Pressable onPress={onRecharger} hitSlop={8}>
            <Text style={styles.lien}>{t('jeuReessayer')}</Text>
          </Pressable>
        </View>
      )}

      {connecte && donnees && (
        <>
          {liste.length === 0 ? (
            <Text style={styles.texte}>{t('moisVide')}</Text>
          ) : (
            <View style={styles.podium}>
              {liste.slice(0, 3).map((l, i) => (
                <LigneMois key={`${l.rang}-${l.nom}-${i}`} l={l} t={t} />
              ))}
            </View>
          )}
          {!moiDansTop3 && moi && (
            <View style={styles.maPlace}>
              {!!moi.nom && <Text style={styles.maPlaceTexte}>{String(moi.nom)}</Text>}
              <Text style={styles.maPlaceTexte}>{t('jeuVotreRang', {n: entierJeu(moi.rang)})}</Text>
              <Text style={styles.maPlacePoints}>{t('jeuScore', {n: entierJeu(moi.points)})}</Text>
            </View>
          )}
          {!moi && liste.length > 0 && <Text style={styles.texteDiscret}>{t('moisPasClasseTexte')}</Text>}
          <Text style={styles.texteDiscret}>{t('moisRegle')}</Text>
          {liste.length > 0 && (
            <Pressable onPress={ouvrir} style={({pressed}) => [styles.bouton, pressed && {opacity: 0.8}]}>
              <Ionicons name="podium" size={18} color={C.blanc} />
              <Text style={styles.boutonTexte}>{t('moisVoirTout')}</Text>
            </Pressable>
          )}
        </>
      )}

      <ClassementMoisModal visible={ouvert} onClose={() => setOuvert(false)} etat={etat} onRecharger={onRecharger} />
    </View>
  );
}

/** Modale du classement complet du mois (top 20), sur le modèle de ClassementJeu. */
export function ClassementMoisModal({visible, onClose, etat, onRecharger}) {
  const {t} = useLanguage();
  const donnees = etat?.donnees;
  const liste = lignesClassement(donnees);
  const moi = donnees?.moi && typeof donnees.moi === 'object' ? donnees.moi : null;
  const moiDansTop = liste.some(l => l.moi);

  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.voile}>
        <View style={styles.modale}>
          <View style={styles.enteteModale}>
            <Ionicons name="podium" size={26} color={C.marque} />
            <Text style={styles.titreModale}>{t('moisTitre')}</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.fermer} accessibilityLabel={t('jeuFermer')}>
              <Ionicons name="close" size={22} color={C.texte} />
            </Pressable>
          </View>

          {etat?.charge && !donnees && (
            <View style={styles.centre}>
              <ActivityIndicator color={C.marque} />
            </View>
          )}

          {!etat?.charge && etat?.erreur && !donnees && (
            <View style={styles.centre}>
              <Ionicons name="cloud-offline-outline" size={36} color={C.texteDiscret} />
              <Text style={styles.texteCentre}>{t('jeuClassementHorsLigne')}</Text>
              <Pressable onPress={onRecharger} style={({pressed}) => [styles.bouton, pressed && {opacity: 0.8}]}>
                <Ionicons name="refresh" size={18} color={C.blanc} />
                <Text style={styles.boutonTexte}>{t('jeuReessayer')}</Text>
              </Pressable>
            </View>
          )}

          {donnees && liste.length === 0 && (
            <View style={styles.centre}>
              <Ionicons name="trophy-outline" size={36} color={MEDAILLES[1]} />
              <Text style={styles.texteCentre}>{t('moisVide')}</Text>
            </View>
          )}

          {donnees && liste.length > 0 && (
            <>
              <ScrollView style={styles.liste} contentContainerStyle={{paddingBottom: 4}}>
                {liste.map((l, i) => (
                  <LigneMois key={`${l.rang}-${l.nom}-${i}`} l={l} t={t} />
                ))}
              </ScrollView>
              {!moiDansTop && moi && (
                <View style={styles.maPlace}>
                  <Text style={styles.maPlaceTexte}>{t('jeuVotreRang', {n: entierJeu(moi.rang)})}</Text>
                  <Text style={styles.maPlacePoints}>{t('jeuScore', {n: entierJeu(moi.points)})}</Text>
                </View>
              )}
              {!moiDansTop && !moi && (
                <Text style={[styles.texteDiscret, {textAlign: 'center'}]}>{t('moisPasClasseTexte')}</Text>
              )}
            </>
          )}
          {donnees && <Palmares palmares={donnees.palmares} t={t} />}
          <Text style={[styles.texteDiscret, {textAlign: 'center'}]}>{t('jeuClassementInfo')}</Text>
        </View>
      </View>
    </Modal>
  );
}

/** Palmarès du client, gardé d'un mois sur l'autre : 1res places et record de chaque jeu. */
function Palmares({palmares, t}) {
  const records = Array.isArray(palmares?.records) ? palmares.records.filter(r => r && typeof r === 'object') : [];
  const nbTop1 = entierJeu(palmares?.nb_top1);
  if (records.length === 0 && nbTop1 <= 0) return null;
  return (
    <View style={styles.palmares}>
      <Text style={styles.palmaresTitre}>{t('moisPalmaresTitre')}</Text>
      <Text style={styles.palmaresLigne}>{t('moisNbTop1', {n: nbTop1})}</Text>
      {records.map(r => {
        const jeu = JEUX.find(j => j.jeu === r.jeu);
        if (!jeu) return null;
        return (
          <View key={r.jeu} style={styles.palmaresRecord}>
            <Text style={[styles.palmaresLigne, {flex: 1}]} numberOfLines={1}>
              {t(`${jeu.prefixe}Titre`)}
            </Text>
            <Text style={styles.palmaresLigne}>{t('jeuxRecord', {n: entierJeu(r.score)})}</Text>
          </View>
        );
      })}
    </View>
  );
}

function LigneMois({l, t}) {
  const medaille = MEDAILLES[l.rang];
  return (
    <View style={[styles.ligne, l.moi && styles.ligneMoi]}>
      <View style={styles.rang}>
        {medaille ? (
          <Ionicons name="medal" size={22} color={medaille} />
        ) : (
          <Text style={styles.rangTexte}>{l.rang}</Text>
        )}
      </View>
      <View style={styles.nomLigne}>
        <Text style={styles.nom} numberOfLines={1}>
          {String(l.nom ?? '')}
        </Text>
        {l.moi && (
          <View style={styles.pastille}>
            <Text style={styles.pastilleTexte}>{t('jeuVous')}</Text>
          </View>
        )}
      </View>
      <Text style={styles.points}>{t('jeuScore', {n: entierJeu(l.points)})}</Text>
    </View>
  );
}

export const stylesEncart = StyleSheet.create({
  carte: {
    padding: 14, marginBottom: 12, borderRadius: 18, backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.bordure,
  },
  entete: {flexDirection: 'row', alignItems: 'center', gap: 8},
  titre: {flex: 1, color: C.texte, fontSize: 17, fontWeight: '800'},
});

const styles = StyleSheet.create({
  ...stylesEncart,
  pastilleTemps: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 8,
    backgroundColor: C.fond, borderRadius: 10, borderWidth: 1, borderColor: C.bordure,
    paddingHorizontal: 9, paddingVertical: 4,
  },
  pastilleTempsTexte: {color: C.texteDoux, fontSize: 12, fontWeight: '700'},
  centre: {alignItems: 'center', paddingVertical: 18},
  texte: {color: C.texteDoux, fontSize: 14, lineHeight: 20, marginTop: 10},
  texteCentre: {color: C.texteDoux, fontSize: 15, marginTop: 8, textAlign: 'center', lineHeight: 21},
  texteDiscret: {color: C.texteDiscret, fontSize: 12, lineHeight: 17, marginTop: 8},
  horsLigne: {flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4},
  lien: {color: C.marque, fontSize: 14, fontWeight: '700', marginTop: 8},
  podium: {marginTop: 10},
  maPlace: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6,
    paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12, borderWidth: 2, borderColor: C.marque,
    backgroundColor: C.fond,
  },
  maPlaceTexte: {color: C.texte, fontSize: 15, fontWeight: '800'},
  maPlacePoints: {color: C.texte, fontSize: 14, fontWeight: '700'},
  bouton: {
    flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', alignSelf: 'center',
    marginTop: 12, backgroundColor: C.marque, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 20,
  },
  boutonTexte: {color: C.blanc, fontSize: 15, fontWeight: '700'},
  voile: {flex: 1, backgroundColor: C.voile, alignItems: 'center', justifyContent: 'center', padding: 24},
  modale: {width: '100%', maxWidth: 400, maxHeight: '88%', backgroundColor: C.fond, borderRadius: 20, padding: 18},
  enteteModale: {flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10},
  titreModale: {flex: 1, color: C.texte, fontSize: 20, fontWeight: '800'},
  fermer: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.bordure,
  },
  liste: {flexGrow: 0},
  ligne: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10,
    borderRadius: 12, borderWidth: 1, borderColor: 'transparent', marginBottom: 4,
  },
  ligneMoi: {borderColor: C.marque, borderWidth: 2, backgroundColor: C.marqueClair},
  rang: {width: 30, alignItems: 'center'},
  rangTexte: {color: C.texteDoux, fontSize: 15, fontWeight: '700'},
  nomLigne: {flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6},
  nom: {color: C.texte, fontSize: 15, fontWeight: '700', flexShrink: 1},
  pastille: {backgroundColor: C.marque, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2},
  pastilleTexte: {color: C.blanc, fontSize: 11, fontWeight: '700'},
  points: {color: C.texte, fontSize: 14, fontWeight: '800'},
  palmares: {
    marginTop: 10, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12,
    borderWidth: 1, borderColor: C.bordure, backgroundColor: C.surface,
  },
  palmaresTitre: {color: C.texte, fontSize: 15, fontWeight: '800', marginBottom: 4},
  palmaresRecord: {flexDirection: 'row', alignItems: 'center', gap: 8},
  palmaresLigne: {color: C.texteDoux, fontSize: 14, lineHeight: 20},
});
