const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

config.resolver.sourceExts.push('sql')
config.resolver.assetExts.push('tflite')

// Android CMake 빌드 아티팩트를 Metro 파일 감시에서 제외.
// Windows에서 CMake LTO 테스트가 \\?\ 확장 경로를 포함한 심볼릭 링크를 생성하는데,
// Metro의 FallbackWatcher가 이 경로를 lstat 처리하지 못해 crash 발생.
const blockList = Array.isArray(config.resolver.blockList)
  ? config.resolver.blockList
  : config.resolver.blockList
    ? [config.resolver.blockList]
    : []

config.resolver.blockList = [
  /android[/\\]app[/\\]\.cxx[/\\].*/,
  ...blockList,
]

module.exports = config
