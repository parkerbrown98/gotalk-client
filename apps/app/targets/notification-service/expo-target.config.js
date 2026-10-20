/**
 * iOS Notification Service Extension: decrypts each push from the Gotalk push gateway on the device and sets its
 * text, thread, badge and tap target. Built by @bacons/apple-targets during `expo prebuild`.
 *
 * It reads the device keys the app stores with expo-secure-store through the App Group keychain group, so both
 * targets need the same `com.apple.security.application-groups` entitlement (`ios.entitlements` in app.json).
 *
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = (config) => ({
  type: 'notification-service',
  name: 'NotificationService',
  bundleIdentifier: '.notification-service',
  deploymentTarget: '16.4',
  frameworks: ['CryptoKit', 'UserNotifications', 'Security'],
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
