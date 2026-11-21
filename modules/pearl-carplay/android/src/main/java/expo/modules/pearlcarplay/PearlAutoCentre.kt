package expo.modules.pearlcarplay

import android.content.Intent
import android.content.pm.ApplicationInfo
import android.net.Uri
import androidx.car.app.CarAppService
import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.ScreenManager
import androidx.car.app.Session
import androidx.car.app.validation.HostValidator
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner

// Écran Android Auto de Pearl Delivery (Android for Cars App Library,
// catégorie POI). Le service est déclaré dans le manifeste par
// plugins/withAndroidAuto.js, seulement quand l'option est activée.
//
// Comme sur CarPlay, rien n'est décidé ici : le JS (components/PontCarPlay.js,
// lib/carplay.js) envoie l'écran à montrer et reçoit chaque appui. Modèles
// utilisés : panneau (écran principal), message (alerte) et liste (choix de
// l'app GPS). Aucune carte dessinée, aucune saisie. Les couleurs jour et nuit
// sont celles de la voiture (aucune couleur imposée ici).

data class DonneesLigne(val titre: String, val detail: String)
data class DonneesAction(val id: String, val titre: String, val style: String)
data class DonneesEcran(val titre: String, val lignes: List<DonneesLigne>, val actions: List<DonneesAction>)
data class DonneesModale(
  val id: String,
  val type: String,
  val titres: List<String>,
  val message: String?,
  val actions: List<DonneesAction>,
)

// Centre partagé entre la session de la voiture et le module JS.
object PearlAutoCentre {
  interface Ecouteur {
    fun surConnexion(connecte: Boolean)
    fun surAction(id: String, modale: String)
  }

  // Branché par le module JS (absent tant que le JS n'a pas démarré).
  var ecouteur: Ecouteur? = null

  private var session: PearlAutoSession? = null
  private var racine: EcranRacine? = null

  val connecte: Boolean
    get() = racine != null

  internal fun connecter(s: PearlAutoSession, r: EcranRacine) {
    session = s
    racine = r
    ecouteur?.surConnexion(true)
  }

  internal fun deconnecter(s: PearlAutoSession) {
    if (session !== s) return
    session = null
    racine = null
    ecouteur?.surConnexion(false)
  }

  internal fun agir(id: String, modale: String) {
    ecouteur?.surAction(id, modale)
  }

  private fun ecrans(): ScreenManager? =
    session?.carContext?.getCarService(ScreenManager::class.java)

  // Écran principal : remplacé sur place (même modèle, rafraîchi).
  fun afficher(donnees: DonneesEcran): Boolean {
    val r = racine ?: return false
    r.donnees = donnees
    r.invalidate()
    return true
  }

  // Fenêtre par-dessus l'écran principal. Une seule à la fois : celle déjà
  // ouverte est fermée d'abord.
  fun presenter(modale: DonneesModale): Boolean {
    val r = racine ?: return false
    val gestion = ecrans() ?: return false
    if (gestion.top is EcranModale) gestion.pop()
    gestion.push(EcranModale(r.carContext, modale))
    return true
  }

  // Ferme la fenêtre ouverte ; avec un identifiant, seulement si c'est elle.
  fun fermerModale(id: String?): Boolean {
    val gestion = ecrans() ?: return false
    val haut = gestion.top as? EcranModale ?: return false
    if (id != null && haut.modale.id != id) return false
    gestion.pop()
    return true
  }

  // Lien venu de lib/carplay.js :
  //  - geo:...#Intent;action=androidx.car.app.action.NAVIGATE;package=<app>;end :
  //    itinéraire dans l'app GPS choisie, sur l'écran de la voiture ;
  //  - tel:<numéro> : appel par le téléphone, depuis la voiture.
  // Faux si l'app GPS n'est pas installée ou si la voiture refuse.
  fun ouvrirLien(lien: String): Boolean {
    val contexte = session?.carContext ?: return false
    val intention = try {
      when {
        lien.startsWith("tel:") -> Intent(Intent.ACTION_DIAL, Uri.parse(lien))
        lien.startsWith("geo:") -> {
          // Seuls l'adresse geo: et le paquet sont repris de l'intention reçue.
          // Drapeau 0 : avec URI_INTENT_SCHEME, un lien qui ne commence pas par intent: perd son #Intent (paquet ignoré).
          val lue = Intent.parseUri(lien, 0)
          val donnee = lue.data ?: return false
          if (donnee.scheme != "geo") return false
          val paquet = lue.`package`
          if (paquet != null && contexte.packageManager.getLaunchIntentForPackage(paquet) == null) {
            return false
          }
          Intent(CarContext.ACTION_NAVIGATE, donnee).apply { if (paquet != null) setPackage(paquet) }
        }
        else -> return false
      }
    } catch (e: Exception) {
      return false
    }
    return try {
      contexte.startCarApp(intention)
      true
    } catch (e: Exception) {
      false
    }
  }
}

class PearlAutoSession : Session() {
  init {
    lifecycle.addObserver(object : DefaultLifecycleObserver {
      override fun onDestroy(owner: LifecycleOwner) {
        PearlAutoCentre.deconnecter(this@PearlAutoSession)
      }
    })
  }

  override fun onCreateScreen(intent: Intent): Screen {
    val racine = EcranRacine(carContext)
    PearlAutoCentre.connecter(this, racine)
    return racine
  }
}

class PearlCarAppService : CarAppService() {
  // Build de test (débogable) : toute voiture, dont l'unité de bureau (DHU).
  // Build publié : seulement les hôtes connus d'Android Auto (liste Google).
  override fun createHostValidator(): HostValidator {
    val debogable = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
    return if (debogable) {
      HostValidator.ALLOW_ALL_HOSTS_VALIDATOR
    } else {
      HostValidator.Builder(applicationContext)
        .addAllowedHosts(androidx.car.app.R.array.hosts_allowlist_sample)
        .build()
    }
  }

  override fun onCreateSession(): Session = PearlAutoSession()
}
