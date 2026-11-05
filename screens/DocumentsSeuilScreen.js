import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import StatusBarShield from '../components/StatusBarShield';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { uploadService } from '../services/uploadService';
import {
  chargerDocumentsSeuil, donneesConnues, ecouter, envoyerDocumentSeuil, texteBlocage,
} from '../services/documentsSeuil';
import { formatAmount, formatDayMonth, formatTime } from '../lib/i18nFormat';
import { dirIcon } from '../lib/rtl';
import useSecureScreen from '../hooks/useSecureScreen';

const BRAND = '#FF6A13';

// Documents demandés au seuil de gains. Tout vient du serveur : états,
// motifs, seuil. L'écran n'additionne aucun montant.

const NOMS = { rib: 'docsSeuilRib', identite: 'docsSeuilIdentite', domicile: 'docsSeuilDomicile' };
const ICONES = { rib: 'card-outline', identite: 'person-outline', domicile: 'home-outline' };
// Champs par défaut si le serveur n'en donne pas.
const CHAMPS = {
  rib: ['iban_doc_url'],
  identite: ['id_card_front_url', 'id_card_back_url'],
  domicile: ['proof_of_address_url'],
};
const PASTILLES = {
  manquant: { cle: 'docsSeuilEtatManquant', fond: '#FFF1E8', texte: '#C2410C' },
  en_attente: { cle: 'docsSeuilEtatEnAttente', fond: '#FEF6E0', texte: '#8A5A00' },
  valide: { cle: 'docsSeuilEtatValide', fond: '#00C29B', texte: '#FFFFFF' },
  refuse: { cle: 'docsSeuilEtatRefuse', fond: '#FDECEC', texte: '#B42318' },
  expire: { cle: 'docsSeuilEtatExpire', fond: '#FDECEC', texte: '#B42318' },
};
const MOTIFS = {
  flou: 'docsSeuilMotifFlou',
  illisible: 'docsSeuilMotifIllisible',
  expire: 'docsSeuilMotifExpire',
  trop_ancien: 'docsSeuilMotifTropAncien',
  incomplet: 'docsSeuilMotifIncomplet',
  nom_different: 'docsSeuilMotifNomDifferent',
  mineur: 'docsSeuilMotifMineur',
  autre: 'docsSeuilMotifAutre',
};

// Alert à choix, sous forme de promesse : résout la valeur du bouton touché.
function choisir(titre, message, options) {
  return new Promise((resolve) => {
    Alert.alert(
      titre,
      message,
      options.map((o) => ({ text: o.text, style: o.style, onPress: () => resolve(o.valeur) })),
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

export default function DocumentsSeuilScreen({ navigation }) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { dark, colors } = useTheme();
  const s = useMemo(() => makeStyles(dark, colors), [dark, colors]);
  // Pièces du livreur (identité, RIB, domicile) : captures bloquées.
  useSecureScreen('DocumentsSeuil');

  const [donnees, setDonnees] = useState(donneesConnues);
  const [chargement, setChargement] = useState(!donneesConnues());
  const [echecChargement, setEchecChargement] = useState(false);
  // Par document : { fichiers: { champ: { uri, size, type, url } }, envoi, erreur }.
  // Les photos choisies restent ici tant que l'envoi n'a pas réussi.
  const [brouillons, setBrouillons] = useState({});
  const brouillonsRef = useRef({});
  const verrous = useRef({});
  const monte = useRef(true);

  useEffect(() => {
    monte.current = true;
    const stop = ecouter((d) => { if (monte.current) setDonnees(d); });
    return () => { monte.current = false; stop(); };
  }, []);

  const majBrouillon = useCallback((cle, maj) => {
    const suivant = { ...brouillonsRef.current, [cle]: maj ? { ...(brouillonsRef.current[cle] || {}), ...maj } : undefined };
    if (!maj) delete suivant[cle];
    brouillonsRef.current = suivant;
    if (monte.current) setBrouillons(suivant);
  }, []);

  const charger = useCallback(async () => {
    setEchecChargement(false);
    // Une exception du service ne doit pas laisser la roue tourner sans fin.
    let d = null;
    try { d = await chargerDocumentsSeuil(); } catch (e) { d = null; }
    if (!monte.current) return;
    if (d) setDonnees(d);
    else if (!donneesConnues()) setEchecChargement(true);
    setChargement(false);
  }, []);

  useFocusEffect(useCallback(() => { charger(); }, [charger]));

  async function prendre(source) {
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert(t('cameraDeniedTitle'), t('cameraDeniedMsg'));
          return null;
        }
        const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
        if (res.canceled || !res.assets?.length) return null;
        const a = res.assets[0];
        return { uri: a.uri, size: a.fileSize ?? null, type: a.mimeType ?? 'image/jpeg' };
      }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (res.canceled || !res.assets?.length) return null;
      const a = res.assets[0];
      return { uri: a.uri, size: a.fileSize ?? null, type: a.mimeType ?? 'image/jpeg' };
    } catch {
      return null;
    }
  }

  // Envoie les photos du brouillon (téléversement puis enregistrement).
  // Une photo déjà téléversée n'est pas renvoyée au nouvel essai.
  const envoyer = useCallback(async (cle) => {
    if (verrous.current[cle]) return;
    const brouillon = brouillonsRef.current[cle];
    if (!brouillon || !brouillon.fichiers) return;
    verrous.current[cle] = true;
    majBrouillon(cle, { envoi: true, erreur: null });
    try {
      const fichiers = { ...brouillon.fichiers };
      for (const champ of Object.keys(fichiers)) {
        const f = fichiers[champ];
        if (f.url) continue;
        const url = await uploadService.uploadDriverDoc({
          fileUri: f.uri,
          slot: champ.replace(/_url$/, ''),
          size: f.size,
          contentType: f.type,
        });
        fichiers[champ] = { ...f, url };
        majBrouillon(cle, { fichiers: { ...fichiers } });
      }
      const corps = { cle };
      Object.keys(fichiers).forEach((champ) => { corps[champ] = fichiers[champ].url; });
      const d = await envoyerDocumentSeuil(corps);
      majBrouillon(cle, null);
      if (!d) charger();
    } catch (e) {
      const message = (typeof e?.serverData?.message === 'string' && e.serverData.message.trim())
        || e?.serverMessage || t('docsSeuilEchecEnvoi');
      majBrouillon(cle, { envoi: false, erreur: message });
    } finally {
      verrous.current[cle] = false;
    }
  }, [majBrouillon, charger, t]);

  const sources = [
    { text: t('docsSeuilAppareilPhoto'), valeur: 'camera' },
    { text: t('docsSeuilGalerie'), valeur: 'galerie' },
  ];

  async function demarrer(doc) {
    const cle = doc.cle;
    if (verrous.current[cle] || brouillonsRef.current[cle]?.envoi) return;
    verrous.current[cle] = true;
    try {
      const champs = Array.isArray(doc.champs) && doc.champs.length ? doc.champs : (CHAMPS[cle] || []);
      if (!champs.length) return;
      const nom = t(NOMS[cle] || 'docsSeuilTitre');
      const fichiers = {};
      const estIdentite = cle === 'identite' && champs.length > 1;
      const source1 = await choisir(nom, estIdentite ? t('docsSeuilRecto') : null,
        [...sources, { text: t('cancel'), style: 'cancel', valeur: null }]);
      if (!source1) return;
      const premier = await prendre(source1);
      if (!premier) return;
      fichiers[champs[0]] = premier;
      if (estIdentite) {
        // Verso facultatif (passeport : une seule page). Court délai : iOS
        // n'affiche pas une alerte pendant la fermeture du sélecteur.
        await new Promise((r) => setTimeout(r, 400));
        const source2 = await choisir(nom, t('docsSeuilVerso'),
          [...sources, { text: t('docsSeuilSansVerso'), style: 'cancel', valeur: null }]);
        if (source2) {
          const verso = await prendre(source2);
          if (verso) fichiers[champs[1]] = verso;
        }
      }
      brouillonsRef.current = { ...brouillonsRef.current, [cle]: { fichiers, envoi: false, erreur: null } };
      if (monte.current) setBrouillons(brouillonsRef.current);
    } finally {
      verrous.current[cle] = false;
    }
    envoyer(cle);
  }

  const etat = donnees?.etat;
  const mineur = etat === 'bloque' && donnees?.motif_blocage === 'livreur_mineur';

  function phraseHaut() {
    if (!donnees) return null;
    const seuil = Number(donnees.seuil_blocage);
    const seuilTexte = Number.isFinite(seuil) && seuil > 0 ? `${formatAmount(seuil, 0)} €` : null;
    if (etat === 'bloque') return texteBlocage(t, donnees.motif_blocage);
    if (etat === 'en_verification') {
      const j = donnees.verification_jusquau;
      return j && formatDayMonth(j)
        ? t('docsSeuilIntroVerificationJusqua', { date: formatDayMonth(j), heure: formatTime(j) })
        : t('docsSeuilBandeauVerificationTexte');
    }
    if (etat === 'complet') return t('docsSeuilIntroComplet');
    if (etat === 'rien') return t('docsSeuilIntroRien');
    return seuilTexte ? t('docsSeuilIntroRappel', { seuil: seuilTexte }) : t('docsSeuilBandeauRappelTexte');
  }

  function carte(doc) {
    const cle = doc.cle;
    const pastille = PASTILLES[doc.etat] || PASTILLES.manquant;
    const brouillon = brouillons[cle];
    const valide = doc.etat === 'valide';
    const motif = doc.motif && MOTIFS[doc.motif] ? t(MOTIFS[doc.motif]) : null;
    const commentaire = typeof doc.commentaire === 'string' && doc.commentaire.trim() ? doc.commentaire.trim() : null;
    const montrerRaison = (doc.etat === 'refuse' || doc.etat === 'expire') && (motif || commentaire);
    const libelleBouton = doc.etat === 'manquant' ? t('docsSeuilEnvoyer') : t('docsSeuilRenvoyer');
    return (
      <View key={cle} style={s.carte}>
        <View style={s.ligneHaut}>
          <Ionicons name={ICONES[cle] || 'document-outline'} size={22} color={BRAND} style={{ marginRight: 10 }} />
          <Text style={s.nom} numberOfLines={2}>{t(NOMS[cle] || 'docsSeuilTitre')}</Text>
          <View style={[s.pastille, { backgroundColor: pastille.fond }]}>
            <Text style={[s.pastilleTexte, { color: pastille.texte }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t(pastille.cle)}</Text>
          </View>
        </View>

        {montrerRaison && (
          <View style={s.raison}>
            {!!motif && <Text style={s.raisonTexte}>{motif}</Text>}
            {!!commentaire && <Text style={[s.raisonTexte, !!motif && { marginTop: 4 }]}>{commentaire}</Text>}
          </View>
        )}

        {!!doc.expire_le && formatDayMonth(doc.expire_le) !== '' && (
          <Text style={s.info}>{t('docsSeuilExpireLe', { date: formatDayMonth(doc.expire_le, { year: true }) })}</Text>
        )}
        {doc.etat === 'en_attente' && !!doc.envoye_le && formatDayMonth(doc.envoye_le) !== '' && (
          <Text style={s.info}>{t('docsSeuilEnvoyeLe', { date: formatDayMonth(doc.envoye_le, { year: true }) })}</Text>
        )}

        {brouillon?.fichiers && (
          <View style={s.apercus}>
            {Object.keys(brouillon.fichiers).map((champ) => (
              <Image key={champ} source={{ uri: brouillon.fichiers[champ].uri }} style={s.apercu} />
            ))}
          </View>
        )}
        {!!brouillon?.erreur && <Text style={s.erreur}>{brouillon.erreur}</Text>}

        {!valide && !mineur && (
          brouillon?.envoi ? (
            <View style={[s.bouton, s.boutonEnCours]}>
              <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
              <Text style={s.boutonTexte} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('sending')}</Text>
            </View>
          ) : brouillon?.erreur ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable style={[s.bouton, { flex: 1 }]} onPress={() => envoyer(cle)}>
                <Ionicons name="refresh" size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text style={s.boutonTexte} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('retry')}</Text>
              </Pressable>
              <Pressable style={[s.boutonSecondaire, { flex: 1 }]} onPress={() => demarrer(doc)}>
                <Text style={s.boutonSecondaireTexte} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('docsSeuilAutrePhoto')}</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable style={s.bouton} onPress={() => demarrer(doc)}>
              <Ionicons name="camera-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={s.boutonTexte} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{libelleBouton}</Text>
            </Pressable>
          )
        )}
      </View>
    );
  }

  const documents = Array.isArray(donnees?.documents) ? donnees.documents.filter((d) => d && d.cle) : [];

  return (
    <>
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={[s.headerRow, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name={dirIcon('arrow-back')} size={24} color={colors.text} />
        </Pressable>
        <Text style={s.headerTitle}>{t('docsSeuilTitre')}</Text>
        <View style={{ width: 24 }} />
      </View>

      {chargement && !donnees ? (
        <ActivityIndicator color={BRAND} style={{ marginTop: 40 }} />
      ) : echecChargement && !donnees ? (
        <View style={s.vide}>
          <Ionicons name="cloud-offline-outline" size={40} color={dark ? colors.textFaint : '#bbb'} />
          <Text style={s.videTexte}>{t('docsSeuilEchecChargement')}</Text>
          <Pressable style={[s.bouton, { alignSelf: 'stretch', marginHorizontal: 16 }]} onPress={() => { setChargement(true); charger(); }}>
            <Text style={s.boutonTexte} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={[s.intro, etat === 'bloque' && s.introBloque]}>
            <Text style={[s.introTexte, etat === 'bloque' && { color: dark ? '#ff8a80' : '#B42318' }]}>{phraseHaut()}</Text>
          </View>
          {!mineur && documents.map(carte)}
        </>
      )}
    </ScrollView>
    <StatusBarShield />
    </>
  );
}

// Styles selon le mode : en clair, valeurs d'origine à l'identique.
const makeStyles = (dark, c) => {
  const k = (clair, sombre) => (dark ? sombre : clair);
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: k('#f5f5f5', c.bg) },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: k('#111', c.text), flex: 1, textAlign: 'center', marginHorizontal: 8 },
  intro: { backgroundColor: k('#FFF1E8', c.cardAlt), borderRadius: 14, marginHorizontal: 16, padding: 14, marginBottom: 12 },
  introBloque: { backgroundColor: k('#FDECEC', '#3a1d1d') },
  introTexte: { fontSize: 14, color: k('#7C2D12', '#FDBA8C'), lineHeight: 20 },
  carte: { backgroundColor: k('#fff', c.card), borderRadius: 16, marginHorizontal: 16, padding: 16, marginBottom: 12 },
  ligneHaut: { flexDirection: 'row', alignItems: 'center' },
  nom: { flex: 1, fontSize: 15, fontWeight: '700', color: k('#111', c.text) },
  pastille: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginStart: 8, maxWidth: '50%' },
  pastilleTexte: { fontSize: 12, fontWeight: '700' },
  raison: { backgroundColor: k('#FDECEC', '#3a1d1d'), borderRadius: 10, padding: 10, marginTop: 12 },
  raisonTexte: { fontSize: 13, color: k('#B42318', '#ff8a80'), lineHeight: 18 },
  info: { fontSize: 13, color: k('#666', c.textMuted), marginTop: 10 },
  apercus: { flexDirection: 'row', gap: 10, marginTop: 12 },
  apercu: { width: 72, height: 72, borderRadius: 10, backgroundColor: k('#eee', c.borderStrong), borderWidth: 1, borderColor: k('#E6E8EB', c.border) },
  erreur: { fontSize: 13, color: k('#B42318', '#ff8a80'), marginTop: 10 },
  bouton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 10, marginTop: 14 },
  boutonEnCours: { opacity: 0.6 },
  boutonTexte: { color: '#fff', fontWeight: '800', fontSize: 15, flexShrink: 1 },
  boutonSecondaire: { alignItems: 'center', justifyContent: 'center', backgroundColor: k('#fff', c.card), borderRadius: 12, paddingVertical: 13, paddingHorizontal: 10, marginTop: 14, borderWidth: 1, borderColor: k('#E6E8EB', c.borderStrong) },
  boutonSecondaireTexte: { color: k('#111', c.text), fontWeight: '700', fontSize: 15 },
  vide: { alignItems: 'center', marginTop: 40, gap: 12 },
  videTexte: { fontSize: 14, color: k('#666', c.textMuted), textAlign: 'center', paddingHorizontal: 24 },
  });
};
