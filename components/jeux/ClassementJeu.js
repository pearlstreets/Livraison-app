/**
 * Classement d'un mini-jeu (modale), commun aux 4 jeux :
 *   <ClassementJeu jeu="panier" visible={ouvert} onClose={fermer} avantChargement={envoyer} />
 *
 * Top 20 des livreurs (prénom et initiale du nom), médailles, ligne du client
 * mise en avant (« Vous »), son rang s'il est hors du top. États : chargement,
 * vide, hors ligne (Réessayer). Livreur : toujours connecté, pas d'invitation ;
 * serveur driver/jeux/<jeu>/classement/ (lignes sans niveau : niveau masqué).
 * `avantChargement` : envoi du record en attente, ses erreurs sont ignorées.
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useLanguage} from '../../contexts/LanguageContext';
import {deliveryService} from '../../services/deliveryService';
import {COULEURS_JEUX as C, useCompteJeu} from '../../utils/jeux/commun';

const MEDAILLES = {1: '#F2B705', 2: '#A7B1BC', 3: '#CD7F32'};

export default function ClassementJeu({jeu, visible, onClose, avantChargement}) {
  const {t} = useLanguage();
  const {connecte} = useCompteJeu();
  const [etat, setEtat] = useState({charge: true, erreur: false, liste: [], moi: null});
  const monte = useRef(true);
  useEffect(() => {
    monte.current = true;
    return () => {
      monte.current = false;
    };
  }, []);

  const charger = useCallback(async () => {
    setEtat(e => ({...e, charge: true, erreur: false}));
    try {
      if (avantChargement) {
        await Promise.resolve(avantChargement()).catch(() => {});
      }
      const data = await deliveryService.getClassementJeux(jeu);
      if (!monte.current) return;
      setEtat({
        charge: false,
        erreur: false,
        liste: Array.isArray(data?.classement) ? data.classement.filter(l => l && typeof l === 'object') : [],
        moi: data?.moi && typeof data.moi === 'object' ? data.moi : null,
      });
    } catch (e) {
      if (monte.current) setEtat(x => ({...x, charge: false, erreur: true}));
    }
  }, [avantChargement, jeu]);

  useEffect(() => {
    if (visible && connecte) charger();
  }, [visible, connecte, charger]);

  const moiDansTop = etat.liste.some(l => l.moi);

  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.voile}>
        <View style={styles.carte}>
          <View style={styles.entete}>
            <Ionicons name="podium" size={26} color={C.marque} />
            <Text style={styles.titre}>{t('jeuClassement')}</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.fermer} accessibilityLabel={t('jeuFermer')}>
              <Ionicons name="close" size={22} color={C.texte} />
            </Pressable>
          </View>

          {connecte && etat.charge && (
            <View style={styles.centre}>
              <ActivityIndicator color={C.marque} />
            </View>
          )}

          {connecte && !etat.charge && etat.erreur && (
            <View style={styles.centre}>
              <Ionicons name="cloud-offline-outline" size={36} color={C.texteDiscret} />
              <Text style={styles.texte}>{t('jeuClassementHorsLigne')}</Text>
              <Pressable onPress={charger} style={({pressed}) => [styles.bouton, pressed && {opacity: 0.8}]}>
                <Ionicons name="refresh" size={18} color={C.blanc} />
                <Text style={styles.boutonTexte}>{t('jeuReessayer')}</Text>
              </Pressable>
            </View>
          )}

          {connecte && !etat.charge && !etat.erreur && etat.liste.length === 0 && (
            <View style={styles.centre}>
              <Ionicons name="trophy-outline" size={36} color={MEDAILLES[1]} />
              <Text style={styles.titreVide}>{t('jeuClassementVide')}</Text>
              <Text style={styles.texte}>{t('jeuClassementVideTexte')}</Text>
            </View>
          )}

          {connecte && !etat.charge && !etat.erreur && etat.liste.length > 0 && (
            <>
              <ScrollView style={styles.liste} contentContainerStyle={{paddingBottom: 4}}>
                {etat.liste.map((l, i) => (
                  <Ligne key={`${l.rang}-${l.nom}-${i}`} l={l} t={t} />
                ))}
              </ScrollView>
              {!moiDansTop && etat.moi && (
                <View style={styles.votreRang}>
                  {!!etat.moi.nom && <Text style={styles.votreRangTexte}>{String(etat.moi.nom)}</Text>}
                  <Text style={styles.votreRangTexte}>{t('jeuVotreRang', {n: etat.moi.rang})}</Text>
                  <Text style={styles.texteDiscret}>
                    {etat.moi.niveau != null ? `${t('jeuNiveauCourt', {n: etat.moi.niveau})} · ` : ''}
                    {t('jeuScore', {n: etat.moi.score})}
                  </Text>
                </View>
              )}
              {!moiDansTop && !etat.moi && (
                <Text style={[styles.texteDiscret, {marginTop: 10}]}>{t('jeuClassementPasJoue')}</Text>
              )}
            </>
          )}
          {connecte && <Text style={[styles.texteDiscret, {marginTop: 10}]}>{t('jeuClassementInfo')}</Text>}
        </View>
      </View>
    </Modal>
  );
}

function Ligne({l, t}) {
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
      <View style={{flex: 1}}>
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
        {l.niveau != null && <Text style={styles.texteDiscretGauche}>{t('jeuNiveauCourt', {n: l.niveau})}</Text>}
      </View>
      <Text style={styles.score}>{l.score}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  voile: {flex: 1, backgroundColor: C.voile, alignItems: 'center', justifyContent: 'center', padding: 24},
  carte: {width: '100%', maxWidth: 400, maxHeight: '88%', backgroundColor: C.fond, borderRadius: 20, padding: 18},
  entete: {flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10},
  titre: {flex: 1, color: C.texte, fontSize: 20, fontWeight: '800'},
  fermer: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.bordure,
  },
  centre: {alignItems: 'center', paddingVertical: 24},
  titreVide: {color: C.texte, fontSize: 18, fontWeight: '800', marginTop: 10, textAlign: 'center'},
  texte: {color: C.texteDoux, fontSize: 15, marginTop: 8, textAlign: 'center', lineHeight: 21},
  texteDiscret: {color: C.texteDiscret, fontSize: 13, marginTop: 4, textAlign: 'center'},
  texteDiscretGauche: {color: C.texteDiscret, fontSize: 12, marginTop: 2},
  bouton: {
    flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 14, backgroundColor: C.marque,
    borderRadius: 14, paddingVertical: 12, paddingHorizontal: 22,
  },
  boutonTexte: {color: C.blanc, fontSize: 16, fontWeight: '700'},
  liste: {flexGrow: 0},
  ligne: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 10,
    borderRadius: 12, borderWidth: 1, borderColor: 'transparent', marginBottom: 4,
  },
  ligneMoi: {borderColor: C.marque, borderWidth: 2, backgroundColor: C.marqueClair},
  rang: {width: 30, alignItems: 'center'},
  rangTexte: {color: C.texteDoux, fontSize: 15, fontWeight: '700'},
  nomLigne: {flexDirection: 'row', alignItems: 'center', gap: 6},
  nom: {color: C.texte, fontSize: 15, fontWeight: '700', flexShrink: 1},
  pastille: {backgroundColor: C.marque, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2},
  pastilleTexte: {color: C.blanc, fontSize: 11, fontWeight: '700'},
  score: {color: C.texte, fontSize: 16, fontWeight: '800'},
  votreRang: {marginTop: 8, paddingVertical: 10, borderRadius: 12, borderWidth: 2, borderColor: C.marque, alignItems: 'center'},
  votreRangTexte: {color: C.texte, fontSize: 15, fontWeight: '800'},
});
