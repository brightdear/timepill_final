const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

config.resolver.sourceExts.push('sql')
config.resolver.assetExts.push('tflite')

module.exports = config
