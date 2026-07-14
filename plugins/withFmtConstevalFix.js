// Expo config plugin: fix the `fmt` pod failing to compile under Xcode 26's
// stricter C++20 `consteval` enforcement (RN 0.79 vendors an old {fmt}).
//
// Error it fixes:
//   ios/Pods/fmt/include/fmt/format-inl.h: call to consteval function
//   'fmt::basic_format_string<...>' is not a constant expression
//
// Since `consteval` is a C++20 feature, compiling only the `fmt` pod against
// C++17 skips the problematic compile-time format-string path (fmt falls back
// to runtime validation). Upstream fix (fmt 12.1) only lands in RN >= 0.83 /
// Expo SDK 56, so this workaround is needed for SDK 53.
//
// Remove this plugin after upgrading to an Expo SDK whose React Native bundles
// an Xcode-26-compatible {fmt}.

const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const FMT_FIX = `
    # [withFmtConstevalFix] Compile the fmt pod as C++17 to avoid Xcode 26
    # consteval errors. Runs after react_native_post_install so it wins.
    installer.pods_project.targets.each do |fmt_target|
      if fmt_target.name == 'fmt'
        fmt_target.build_configurations.each do |fmt_config|
          fmt_config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
        end
      end
    end
`;

module.exports = function withFmtConstevalFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let contents = await fs.promises.readFile(podfilePath, 'utf8');

      if (contents.includes('[withFmtConstevalFix]')) {
        return cfg; // already applied
      }
      if (!contents.includes('post_install do |installer|')) {
        throw new Error(
          '[withFmtConstevalFix] Could not find "post_install do |installer|" in the generated Podfile.'
        );
      }

      // Insert the fmt fix just before the post_install block's closing `end`,
      // i.e. after react_native_post_install(...) so our setting is not
      // overridden by React Native's global C++ standard.
      const before = contents;
      contents = contents.replace(
        /(post_install do \|installer\|[\s\S]*?)(\n[ \t]*end)/,
        (_match, block, blockEnd) => `${block}${FMT_FIX}${blockEnd}`
      );

      if (contents === before) {
        throw new Error(
          '[withFmtConstevalFix] Failed to inject the fmt fix into the Podfile post_install block.'
        );
      }

      await fs.promises.writeFile(podfilePath, contents);
      return cfg;
    },
  ]);
};
