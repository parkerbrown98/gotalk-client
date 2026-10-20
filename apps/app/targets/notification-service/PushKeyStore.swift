import Foundation
import Security

/// Reads the keychain items the app writes with expo-secure-store (`keychainService: "gotalk.push"`, which it
/// stores as service `gotalk.push:no-auth` with the key as account) in the shared App Group access group.
enum PushKeyStore {
  /// `group.<main app bundle ID>`, the App Group both targets are entitled to. The extension's bundle ID is the
  /// app's with one more component.
  static var accessGroup: String? {
    guard let id = Bundle.main.bundleIdentifier, let dot = id.lastIndex(of: ".") else { return nil }
    return "group." + String(id[..<dot])
  }

  static func read(subscriptionId: String) -> StoredPushRecord? {
    guard let group = accessGroup else { return nil }
    // The same key the app builds in push-platform.native.ts: anything outside [A-Za-z0-9._-] becomes "_".
    let safe = String(subscriptionId.map { c -> Character in
      c.isASCII && (c.isLetter || c.isNumber || c == "." || c == "-" || c == "_") ? c : "_"
    })
    let account = Data(("sub." + safe).utf8)
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "gotalk.push:no-auth",
      kSecAttrAccount as String: account,
      kSecAttrAccessGroup as String: group,
      kSecMatchLimit as String: kSecMatchLimitOne,
      kSecReturnData as String: true,
    ]
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
    return StoredPushRecord(json: data)
  }
}
