// Écran CarPlay de Pearl Delivery, tenu à jour depuis l'app téléphone.
//
// Ne dessine rien sur le téléphone. Lit la session (AuthContext), l'accueil
// publié par screens/OrdersScreen.js et les étapes gardées
// (services/etapesCourses.js), en tire l'écran de la voiture (lib/carplay.js)
// et transmet chaque appui aux fonctions du téléphone (services/pontCarPlay.js),
// avec leurs contrôles : rien n'est refait ici.
// Sans module natif CarPlay (Android, Expo Go, build sans l'option), ne monte rien.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import * as CarPlay from '../modules/pearl-carplay';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { cleCourse, ecouterEtapes, lireEtape } from '../services/etapesCourses';
import { agirAccueil, attendrePilote, ecouterAccueil, lireAccueil, piloteOuvert } from '../services/pontCarPlay';
import { navigate } from '../services/navigationService';
import {
  alerteInfo, alerteOffre, destinationEtape, ecranCarPlay, etapeDeCourse, feuilleItineraire,
  liensItineraire, messageCourt, telephoneClient,
} from '../lib/carplay';

export default function PontCarPlay() {
  if (!CarPlay.carPlayPresent()) return null;
  return <PontActif />;
}

// Étape que chaque bouton fait franchir, pour ne jamais en sauter une.
const ETAPE_DU_BOUTON = { recuperee: 0, arrive: 1 };

function PontActif() {
  const { user, bootstrapping, accountActive, isOnline } = useAuth() || {};
  const { t } = useLanguage();
  const { fmtPrice } = useCurrency();

  const [connecte, setConnecte] = useState(() => CarPlay.estConnecte());
  const [accueil, setAccueil] = useState(lireAccueil);
  const [, setVersionEtapes] = useState(0);
  const [enCours, setEnCours] = useState(null);

  useEffect(() => CarPlay.ecouter('surConnexion', (e) => setConnecte(Boolean(e && e.connecte))), []);
  useEffect(() => ecouterAccueil(setAccueil), []);
  useEffect(() => ecouterEtapes(() => setVersionEtapes((v) => v + 1)), []);

  const session = bootstrapping ? 'chargement' : !user ? 'deconnecte' : accountActive === false ? 'desactive' : 'ok';
  const course = (accueil.courses || [])[0] || null;
  const cle = course ? cleCourse(course) : null;
  const garde = cle ? lireEtape(cle) : null;
  const online = Boolean(isOnline);
  const offre = online && !course ? accueil.offre : null;
  const prix = useCallback((n) => fmtPrice(Number(n) || 0), [fmtPrice]);

  const ecran = ecranCarPlay(
    { session, accueilPret: accueil.pret, online, enCours, offre, course, garde },
    t,
    prix,
  );

  // Écran principal : envoyé seulement s'il a changé.
  const dernierEcran = useRef('');
  const json = JSON.stringify(ecran);
  useEffect(() => {
    if (!connecte) { dernierEcran.current = ''; return; }
    if (json === dernierEcran.current) return;
    dernierEcran.current = json;
    CarPlay.afficher(JSON.parse(json));
  }, [connecte, json]);

  // Nouvelle course : alerte par-dessus, fermée si la course n'est plus proposée.
  const alerteOuverte = useRef(null);
  const modaleOffre = session === 'ok' && accueil.pret && offre ? alerteOffre(offre, t, prix) : null;
  const idOffre = modaleOffre ? modaleOffre.id : null;
  const modaleRef = useRef(modaleOffre);
  modaleRef.current = modaleOffre;
  useEffect(() => {
    if (!connecte) { alerteOuverte.current = null; return; }
    if (idOffre && alerteOuverte.current !== idOffre) {
      alerteOuverte.current = idOffre;
      CarPlay.presenter(modaleRef.current);
    } else if (!idOffre && alerteOuverte.current) {
      CarPlay.fermerModale(alerteOuverte.current);
      alerteOuverte.current = null;
    }
  }, [connecte, idOffre]);

  // État lu au moment de l'appui (l'écouteur natif est branché une fois).
  const etat = useRef({});
  etat.current = { t, course, cle, garde, offre, idOffre };

  const info = useCallback((id, ...titres) => CarPlay.presenter(alerteInfo(id, titres, etat.current.t)), []);
  const voirTelephone = useCallback((titre) => {
    const { t: tr } = etat.current;
    info('info', `${titre}\n${tr('carplayVoirTelephone')}`, titre);
  }, [info]);

  // Écran de livraison ouvert sur le téléphone pour la course en cours.
  const ouvrirLivraison = useCallback(() => {
    const { course: c, cle: k, garde: g } = etat.current;
    if (!c || piloteOuvert(k)) return;
    navigate('Accueil', { screen: 'DeliveryFlow', params: { order: c, initialStep: etapeDeCourse(g, c.status) } });
  }, []);

  const surAction = useCallback(async ({ id, modale } = {}) => {
    const { t: tr, course: c, cle: k, garde: g, offre: o, idOffre: io } = etat.current;
    if (!id || id === 'fermer') return;

    if (id === 'enLigne' || id === 'horsLigne') {
      setEnCours(id);
      let res;
      try {
        res = await agirAccueil(id === 'enLigne' ? 'passerEnLigne' : 'passerHorsLigne');
      } catch {
        res = { enLigne: id !== 'enLigne', message: '' };
      } finally {
        setEnCours(null);
      }
      if (res == null) { info('info', tr('carplayOuvrezTelephone')); return; }
      if (id === 'horsLigne') {
        if (res.motif === 'course') info('info', tr('carplayContinuezTelephone'));
        return;
      }
      if (res.enLigne) return;
      if (res.motif === 'position') { info('info', tr('carplayPositionRefusee')); return; }
      const refus = tr('carplayRefusEnLigne');
      const msg = messageCourt(res.message);
      info('info', `${refus}\n${msg || tr('carplayVoirTelephone')}`, refus);
      return;
    }

    if (id === 'accepter' || id === 'refuser') {
      if (!o || (modale && modale !== io)) { info('info', tr('carplayOffreIndisponible')); return; }
      setEnCours(id);
      let ok = false;
      try { ok = await agirAccueil(id, o); } catch { ok = false; } finally { setEnCours(null); }
      if (ok == null) info('info', tr('carplayOuvrezTelephone'));
      else if (!ok && id === 'accepter') voirTelephone(tr('carplayActionImpossible'));
      return;
    }

    if (!c) return;
    const etape = etapeDeCourse(g, c.status);

    if (id === 'itineraire') { CarPlay.presenter(feuilleItineraire(tr)); return; }
    if (id.startsWith('gps:')) {
      const liens = liensItineraire(destinationEtape(c, etape));
      const lien = liens && liens[id.slice(4)];
      const ok = lien ? await CarPlay.ouvrirUrl(lien) : false;
      if (!ok) info('info', tr('carplayGpsIndisponible'));
      return;
    }

    if (id === 'recuperee' || id === 'arrive') {
      setEnCours(id);
      let ok = false;
      try {
        ouvrirLivraison();
        const pilote = await attendrePilote(k);
        ok = pilote ? await pilote(ETAPE_DU_BOUTON[id]) : false;
      } catch {
        ok = false;
      } finally {
        setEnCours(null);
      }
      if (!ok) voirTelephone(tr('carplayActionImpossible'));
      return;
    }

    if (id === 'telephone') {
      ouvrirLivraison();
      info('info', tr('carplayContinuezTelephone'));
      return;
    }

    if (id === 'appeler') {
      const tel = telephoneClient(c);
      let ok = tel ? await CarPlay.ouvrirUrl(`tel:${tel}`) : false;
      if (!ok && tel) {
        try { await Linking.openURL(`tel:${tel}`); ok = true; } catch { ok = false; }
      }
      if (!ok) info('info', tr('carplayAppelImpossible'));
    }
  }, [info, voirTelephone, ouvrirLivraison]);

  useEffect(() => CarPlay.ecouter('surAction', surAction), [surAction]);

  return null;
}
