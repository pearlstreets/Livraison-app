package expo.modules.pearlcarplay

import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

// Écran Android Auto de Pearl Delivery : même interface JS que le module
// CarPlay (modules/pearl-carplay/index.js), lu par components/PontCarPlay.js.
// Le JS envoie l'écran principal (afficher) et les fenêtres par-dessus
// (presenter, fermerModale) ; chaque appui revient en événement surAction.

class LigneAuto : Record {
  @Field val titre: String = ""
  @Field val detail: String = ""
}

class ActionAuto : Record {
  @Field val id: String = ""
  @Field val titre: String = ""
  // Écran : "normal", "confirmer", "annuler". Fenêtre : "normal", "annuler", "danger".
  @Field val style: String = "normal"
}

class EcranAutoRecord : Record {
  @Field val titre: String = ""
  @Field val lignes: List<LigneAuto> = emptyList()
  @Field val actions: List<ActionAuto> = emptyList()
}

class ModaleAutoRecord : Record {
  @Field val id: String = ""
  // "alerte" ou "feuille".
  @Field val type: String = "alerte"
  // Alerte : variantes du titre, de la plus longue à la plus courte (la
  // première est montrée, l'écran de la voiture coupe lui-même). Feuille : la
  // première sert de titre.
  @Field val titres: List<String> = emptyList()
  @Field val message: String? = null
  @Field val actions: List<ActionAuto> = emptyList()
}

private fun ActionAuto.versDonnees() = DonneesAction(id, titre, style)

class PearlAndroidAutoModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PearlAndroidAuto")

    Events("surConnexion", "surAction")

    OnCreate {
      PearlAutoCentre.ecouteur = object : PearlAutoCentre.Ecouteur {
        override fun surConnexion(connecte: Boolean) {
          sendEvent("surConnexion", mapOf("connecte" to connecte))
        }

        override fun surAction(id: String, modale: String) {
          sendEvent("surAction", mapOf("id" to id, "modale" to modale))
        }
      }
    }

    OnDestroy {
      PearlAutoCentre.ecouteur = null
    }

    Function("estConnecte") {
      PearlAutoCentre.connecte
    }

    AsyncFunction("afficher") { e: EcranAutoRecord ->
      PearlAutoCentre.afficher(
        DonneesEcran(
          e.titre,
          e.lignes.map { DonneesLigne(it.titre, it.detail) },
          e.actions.map { it.versDonnees() },
        ),
      )
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("presenter") { m: ModaleAutoRecord ->
      PearlAutoCentre.presenter(
        DonneesModale(m.id, m.type, m.titres, m.message, m.actions.map { it.versDonnees() }),
      )
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("fermerModale") { id: String? ->
      PearlAutoCentre.fermerModale(id)
    }.runOnQueue(Queues.MAIN)

    // Itinéraire (Google Maps, Waze) et appel ouverts sur l'écran de la
    // voiture. Faux si aucune app ne sait ouvrir le lien.
    AsyncFunction("ouvrirUrl") { lien: String ->
      PearlAutoCentre.ouvrirLien(lien)
    }.runOnQueue(Queues.MAIN)
  }
}
