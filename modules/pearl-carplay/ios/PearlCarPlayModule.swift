import CarPlay
import ExpoModulesCore
import UIKit

// Écran CarPlay de Pearl Delivery (catégorie Driving Task).
//
// La scène CarPlay (PearlCarPlaySceneDelegate, déclarée dans Info.plist par
// plugins/withCarPlay.js) dépose son contrôleur dans PearlCarPlayCentre ; le
// module JS y lit l'état et y affiche ses écrans. Modèles utilisés, tous
// permis pour cette catégorie : information (écran principal), alerte et
// feuille d'actions (présentées par-dessus). Aucune carte, aucune saisie.

// MARK: - Centre partagé entre la scène et le module

public final class PearlCarPlayCentre {
  public static let shared = PearlCarPlayCentre()

  private(set) var controleur: CPInterfaceController?
  private(set) var scene: CPTemplateApplicationScene?

  // Branché par le module JS (absent tant que le JS n'a pas démarré).
  var surConnexion: ((Bool) -> Void)?

  func connecter(scene: CPTemplateApplicationScene, controleur: CPInterfaceController) {
    self.scene = scene
    self.controleur = controleur
    surConnexion?(true)
  }

  func deconnecter() {
    controleur = nil
    scene = nil
    surConnexion?(false)
  }
}

// MARK: - Scène CarPlay

@objc(PearlCarPlaySceneDelegate)
public final class PearlCarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
  public func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didConnect interfaceController: CPInterfaceController
  ) {
    // App ouverte depuis l'écran de la voiture, téléphone pas encore ouvert :
    // React Native démarre sans fenêtre visible (méthode ajoutée à
    // AppDelegate par plugins/withCarPlay.js). Sans cela, aucun JS ne tourne
    // et l'écran CarPlay resterait vide.
    let demarrer = NSSelectorFromString("demarrerReactSansFenetre")
    if let delegue = UIApplication.shared.delegate as? NSObject, delegue.responds(to: demarrer) {
      delegue.perform(demarrer)
    }

    // Écran d'attente au nom de l'app, remplacé dès que le JS a démarré.
    if interfaceController.templates.isEmpty {
      let attente = CPInformationTemplate(title: "Pearl Delivery", layout: .leading, items: [], actions: [])
      interfaceController.setRootTemplate(attente, animated: false, completion: nil)
    }
    PearlCarPlayCentre.shared.connecter(scene: templateApplicationScene, controleur: interfaceController)
  }

  public func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didDisconnectInterfaceController interfaceController: CPInterfaceController
  ) {
    PearlCarPlayCentre.shared.deconnecter()
  }
}

// MARK: - Données reçues du JS

struct LigneCarPlay: Record {
  @Field var titre: String = ""
  @Field var detail: String = ""
}

struct ActionCarPlay: Record {
  @Field var id: String = ""
  @Field var titre: String = ""
  // Écran : "normal", "confirmer", "annuler". Modale : "normal", "annuler", "danger".
  @Field var style: String = "normal"
}

struct EcranCarPlay: Record {
  @Field var titre: String = ""
  @Field var lignes: [LigneCarPlay] = []
  @Field var actions: [ActionCarPlay] = []
}

struct ModaleCarPlay: Record {
  @Field var id: String = ""
  // "alerte" ou "feuille".
  @Field var type: String = "alerte"
  // Alerte : variantes du titre, de la plus longue à la plus courte (CarPlay
  // prend la première qui tient). Feuille : la première sert de titre.
  @Field var titres: [String] = []
  @Field var message: String? = nil
  @Field var actions: [ActionCarPlay] = []
}

// MARK: - Module

public class PearlCarPlayModule: Module {
  private var ecran: CPInformationTemplate?
  private var modale: CPTemplate?
  private var modaleId: String?

  public func definition() -> ModuleDefinition {
    Name("PearlCarPlay")

    Events("surConnexion", "surAction")

    OnCreate {
      PearlCarPlayCentre.shared.surConnexion = { [weak self] connecte in
        DispatchQueue.main.async {
          guard let self = self else { return }
          if !connecte {
            self.ecran = nil
            self.modale = nil
            self.modaleId = nil
          }
          self.sendEvent("surConnexion", ["connecte": connecte])
        }
      }
    }

    OnDestroy {
      PearlCarPlayCentre.shared.surConnexion = nil
    }

    Function("estConnecte") { () -> Bool in
      PearlCarPlayCentre.shared.controleur != nil
    }

    // Écran principal : mis à jour sur place s'il est déjà affiché (pas de
    // clignotement), sinon posé comme racine.
    AsyncFunction("afficher") { (donnees: EcranCarPlay) -> Bool in
      guard let controleur = PearlCarPlayCentre.shared.controleur else { return false }
      let items = donnees.lignes.map { CPInformationItem(title: $0.titre, detail: $0.detail) }
      let maximum = 3 // CPInformationTemplate : trois actions au plus.
      let boutons = donnees.actions.prefix(maximum).map { action -> CPTextButton in
        let style: CPTextButtonStyle
        switch action.style {
        case "confirmer": style = .confirm
        case "annuler": style = .cancel
        default: style = .normal
        }
        let id = action.id
        return CPTextButton(title: action.titre, textStyle: style) { [weak self] _ in
          self?.sendEvent("surAction", ["id": id, "modale": ""])
        }
      }
      if let ecran = self.ecran, controleur.rootTemplate === ecran {
        ecran.title = donnees.titre
        ecran.items = items
        ecran.actions = Array(boutons)
      } else {
        let nouvel = CPInformationTemplate(title: donnees.titre, layout: .leading, items: items, actions: Array(boutons))
        self.ecran = nouvel
        controleur.setRootTemplate(nouvel, animated: false, completion: nil)
      }
      return true
    }.runOnQueue(.main)

    // Alerte ou feuille d'actions par-dessus l'écran principal. Une seule à
    // la fois : celle déjà présentée est fermée d'abord.
    AsyncFunction("presenter") { (donnees: ModaleCarPlay, promise: Promise) in
      guard let controleur = PearlCarPlayCentre.shared.controleur else {
        promise.resolve(false)
        return
      }
      let modaleId = donnees.id
      let actions = donnees.actions.map { action -> CPAlertAction in
        let style: CPAlertAction.Style
        switch action.style {
        case "annuler": style = .cancel
        case "danger": style = .destructive
        default: style = .default
        }
        let id = action.id
        return CPAlertAction(title: action.titre, style: style) { [weak self] _ in
          guard let self = self else { return }
          self.sendEvent("surAction", ["id": id, "modale": modaleId])
          self.fermer(id: modaleId, completion: nil)
        }
      }
      let modele: CPTemplate
      if donnees.type == "feuille" {
        modele = CPActionSheetTemplate(title: donnees.titres.first, message: donnees.message, actions: actions)
      } else {
        let titres = donnees.titres.isEmpty ? [""] : donnees.titres
        modele = CPAlertTemplate(titleVariants: titres, actions: actions)
      }
      let montrer = {
        self.modale = modele
        self.modaleId = modaleId
        controleur.presentTemplate(modele, animated: true) { ok, _ in
          promise.resolve(ok)
        }
      }
      if controleur.presentedTemplate != nil {
        controleur.dismissTemplate(animated: false) { _, _ in montrer() }
      } else {
        montrer()
      }
    }.runOnQueue(.main)

    // Ferme la modale présentée ; avec un identifiant, seulement si c'est elle.
    AsyncFunction("fermerModale") { (id: String?, promise: Promise) in
      self.fermer(id: id) { ok in promise.resolve(ok) }
    }.runOnQueue(.main)

    // Itinéraire (Plans, Google Maps, Waze) et appel ouverts sur l'écran de
    // la voiture. Faux si aucune app ne sait ouvrir le lien.
    AsyncFunction("ouvrirUrl") { (lien: String, promise: Promise) in
      guard let scene = PearlCarPlayCentre.shared.scene, let url = URL(string: lien) else {
        promise.resolve(false)
        return
      }
      scene.open(url, options: nil) { ok in promise.resolve(ok) }
    }.runOnQueue(.main)
  }

  private func fermer(id: String?, completion: ((Bool) -> Void)?) {
    guard let controleur = PearlCarPlayCentre.shared.controleur,
          let modale = self.modale,
          controleur.presentedTemplate === modale,
          id == nil || id == self.modaleId else {
      completion?(false)
      return
    }
    self.modale = nil
    self.modaleId = nil
    controleur.dismissTemplate(animated: true) { ok, _ in completion?(ok) }
  }
}
