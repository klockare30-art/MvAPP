Pod::Spec.new do |s|
  s.name           = 'GoalieVisionTrim'
  s.version        = '0.1.0'
  s.summary        = 'Lossless video trimming for GoalieVision (AVAssetExportSession passthrough).'
  s.description    = s.summary
  s.license        = 'UNLICENSED'
  s.author         = 'GoalieVision'
  s.homepage       = 'https://github.com/klockare30-art/MvAPP'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/klockare30-art/MvAPP.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
