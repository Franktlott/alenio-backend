require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'AlenioThermoworks'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = 'Alenio'
  s.homepage       = 'https://alenio.app'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { :git => 'https://github.com/local/alenio-thermoworks.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Mixed Swift/ObjC: expose ThermaLibFacade via public headers (bridging headers
  # are unsupported for CocoaPods static framework targets).
  s.source_files = 'AlenioThermoworksModule.swift', 'ThermaLibFacade.{h,m}'
  s.public_header_files = 'ThermaLibFacade.h'

  s.vendored_libraries = 'Vendor/libThermaLib.a'
  s.frameworks = 'CoreBluetooth'
  s.libraries = 'c++'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
    'HEADER_SEARCH_PATHS' => '"$(PODS_TARGET_SRCROOT)/Vendor/include"',
    'LIBRARY_SEARCH_PATHS' => '"$(PODS_TARGET_SRCROOT)/Vendor"',
    'OTHER_LDFLAGS' => '-ObjC',
    'CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES' => 'YES'
  }
end
