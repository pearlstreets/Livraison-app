package expo.modules.pearlcarplay

import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.constraints.ConstraintManager
import androidx.car.app.model.Action
import androidx.car.app.model.ActionStrip
import androidx.car.app.model.ItemList
import androidx.car.app.model.ListTemplate
import androidx.car.app.model.MessageTemplate
import androidx.car.app.model.Pane
import androidx.car.app.model.PaneTemplate
import androidx.car.app.model.Row
import androidx.car.app.model.Template

private const val TITRE_APP = "Pearl Delivery"

// Bouton du modèle : « confirmer » (ou la première action d'une alerte qui
// n'est pas « annuler ») devient le bouton principal, aux couleurs de la
// voiture en jour comme en nuit.
private fun bouton(contexte: CarContext, action: DonneesAction, principal: Boolean, surAppui: () -> Unit): Action {
  val b = Action.Builder().setTitle(action.titre).setOnClickListener { surAppui() }
  if (principal && contexte.carAppApiLevel >= 4) b.setFlags(Action.FLAG_PRIMARY)
  return b.build()
}

// Écran principal (modèle panneau) : titre, lignes « libellé / valeur », deux
// boutons en bas et le troisième, s'il y en a un, en haut à droite.
class EcranRacine(contexte: CarContext) : Screen(contexte) {
  var donnees: DonneesEcran? = null

  private fun lignesMax(): Int {
    if (carContext.carAppApiLevel < 2) return 4
    return try {
      carContext.getCarService(ConstraintManager::class.java)
        .getContentLimit(ConstraintManager.CONTENT_LIMIT_TYPE_PANE)
    } catch (e: Exception) {
      4
    }
  }

  override fun onGetTemplate(): Template {
    val d = donnees
      ?: return MessageTemplate.Builder(carContext.getString(R.string.pearl_auto_ouvrez_telephone))
        .setTitle(TITRE_APP)
        .setHeaderAction(Action.APP_ICON)
        .build()

    val pane = Pane.Builder()
    val lignes = d.lignes.filter { it.titre.isNotBlank() }.take(lignesMax())
    lignes.forEach { l ->
      val rang = Row.Builder().setTitle(l.titre)
      if (l.detail.isNotBlank()) rang.addText(l.detail)
      pane.addRow(rang.build())
    }
    if (lignes.isEmpty()) pane.addRow(Row.Builder().setTitle(d.titre.ifBlank { TITRE_APP }).build())

    val actions = d.actions.take(3)
    val idPrincipal = actions.firstOrNull { it.style == "confirmer" }?.id
    actions.take(2).forEach { a ->
      pane.addAction(bouton(carContext, a, a.id == idPrincipal) { PearlAutoCentre.agir(a.id, "") })
    }

    val modele = PaneTemplate.Builder(pane.build())
      .setTitle(d.titre.ifBlank { TITRE_APP })
      .setHeaderAction(Action.APP_ICON)
    actions.getOrNull(2)?.let { a ->
      modele.setActionStrip(
        ActionStrip.Builder()
          .addAction(Action.Builder().setTitle(a.titre).setOnClickListener { PearlAutoCentre.agir(a.id, "") }.build())
          .build(),
      )
    }
    return modele.build()
  }
}

// Fenêtre par-dessus l'écran principal : alerte (modèle message, deux
// boutons au plus) ou choix de l'app GPS (modèle liste, retour pour annuler).
class EcranModale(contexte: CarContext, val modale: DonneesModale) : Screen(contexte) {
  private fun choisir(id: String) {
    if (screenManager.top === this) screenManager.pop()
    PearlAutoCentre.agir(id, modale.id)
  }

  override fun onGetTemplate(): Template =
    if (modale.type == "feuille") feuille() else alerte()

  private fun feuille(): Template {
    val liste = ItemList.Builder()
    modale.actions.filter { it.id != "fermer" }.forEach { a ->
      liste.addItem(Row.Builder().setTitle(a.titre).setOnClickListener { choisir(a.id) }.build())
    }
    return ListTemplate.Builder()
      .setSingleList(liste.build())
      .setTitle(modale.titres.firstOrNull()?.ifBlank { null } ?: TITRE_APP)
      .setHeaderAction(Action.BACK)
      .build()
  }

  private fun alerte(): Template {
    // Première variante (la plus complète) : première ligne en titre, le reste
    // en message. Une seule ligne : titre de l'app, la ligne en message.
    val texte = (modale.titres.firstOrNull() ?: "").trim()
    val morceaux = texte.split("\n").map { it.trim() }.filter { it.isNotEmpty() }
    val titre = if (morceaux.size > 1) morceaux.first() else TITRE_APP
    val corps = buildList {
      addAll(if (morceaux.size > 1) morceaux.drop(1) else morceaux)
      modale.message?.trim()?.takeIf { it.isNotEmpty() }?.let { add(it) }
    }.joinToString("\n").ifBlank { TITRE_APP }

    val modele = MessageTemplate.Builder(corps).setTitle(titre).setHeaderAction(Action.APP_ICON)
    val actions = modale.actions.take(2)
    val idPrincipal = if (actions.size > 1) actions.firstOrNull { it.style != "annuler" }?.id else null
    actions.forEach { a -> modele.addAction(bouton(carContext, a, a.id == idPrincipal) { choisir(a.id) }) }
    return modele.build()
  }
}
