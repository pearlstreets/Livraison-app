# Module local de l'écran CarPlay (modules/pearl-carplay). Compilé dans toutes
# les versions iOS ; il ne s'active que si la scène CarPlay est déclarée
# (plugins/withCarPlay.js, option « actif »).
Pod::Spec.new do |s|
  s.name           = 'PearlCarPlay'
  s.version        = '1.0.0'
  s.summary        = 'Écran CarPlay de Pearl Delivery'
  s.description    = 'Modèles CarPlay (information, alerte, feuille d actions) pilotés depuis le JS.'
  s.author         = 'Pearl Streets'
  s.homepage       = 'https://pearlstreets.com'
  s.license        = { :type => 'Proprietary' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CarPlay'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,swift}'
end
