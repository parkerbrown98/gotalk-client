import Foundation

/// The v1 plaintext of the gateway's payload format; `parsePushPayload` in @gotalk/core.
struct PushPayload {
  let instance: String
  let notificationId: String
  let title: String
  let body: String?
  let threadId: String?
  let badge: Int?
  let target: [String: String]

  init?(json data: Data) {
    guard
      let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      o["v"] as? Int == 1,
      let instance = o["instance"] as? String,
      o["user_id"] is String,
      let notificationId = o["notification_id"] as? String,
      Route.isID(notificationId)
    else { return nil }
    self.instance = instance
    self.notificationId = notificationId
    self.title = o["title"] as? String ?? ""
    self.body = o["body"] as? String
    self.threadId = o["thread_id"] as? String
    self.badge = (o["badge"] as? Int).flatMap { $0 >= 0 ? $0 : nil }
    var target: [String: String] = [:]
    for (key, value) in o["target"] as? [String: Any] ?? [:] {
      if Route.targetKeys.contains(key), let id = value as? String, Route.isID(id) { target[key] = id }
    }
    self.target = target
  }

  /// A notification fetched from the instance, worded like the app's inbox.
  init?(notification n: [String: Any], instance: String, userId: String) {
    guard let id = n["id"] as? String, Route.isID(id), let kind = n["kind"] as? String else { return nil }
    let actor = (n["actor"] as? [String: Any])?["display_name"] as? String ?? "Someone"
    let data = n["data"] as? [String: Any] ?? [:]
    let topic = data["topic_title"] as? String
    let titles: [String: String] = [
      "mention": "\(actor) mentioned you",
      "reply": "\(actor) replied to you",
      "topic_reply": "\(actor) replied in a topic you watch",
      "direct_message": "\(actor) sent you a message",
      "reaction": "\(actor) reacted to your post",
      "new_topic": "\(actor) started a topic",
      "solution": "\(actor) accepted your reply as the solution",
      "moderation": "A moderator took action",
    ]
    self.instance = instance
    self.notificationId = id
    self.title = titles[kind] ?? "New notification"
    self.body = (data["excerpt"] as? String) ?? topic
    self.badge = nil
    var target: [String: String] = [:]
    for key in ["place_id", "topic_id", "post_id", "message_id"] {
      if let v = n[key] as? String { target[key] = v }
    }
    let channel = n["channel_id"] as? String
    if let channel { target[n["place_id"] is String ? "channel_id" : "conversation_id"] = channel }
    self.target = target
    self.threadId = channel ?? (n["topic_id"] as? String)
  }
}

/// `pushOpenPath` in @gotalk/core: the app route a tap opens.
enum Route {
  static let targetKeys = ["place_id", "board_id", "topic_id", "channel_id", "conversation_id", "message_id", "post_id"]
  private static let params = [
    "place_id": "place", "board_id": "board", "topic_id": "topic", "channel_id": "channel",
    "conversation_id": "conversation", "message_id": "message", "post_id": "post",
  ]
  private static let unreserved = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.~")

  static func isID(_ s: String) -> Bool {
    !s.isEmpty && s.count <= 100 && s.unicodeScalars.allSatisfy { CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-").contains($0) }
  }

  static func sameInstance(_ a: String, _ b: String) -> Bool {
    normalize(a) == normalize(b)
  }

  private static func normalize(_ s: String) -> String {
    var t = s.trimmingCharacters(in: .whitespaces).lowercased()
    while t.hasSuffix("/") { t.removeLast() }
    return t
  }

  private static func encode(_ s: String) -> String {
    s.addingPercentEncoding(withAllowedCharacters: unreserved) ?? ""
  }

  static func open(instance: String, notificationId: String?, target: [String: String]) -> String {
    var t = instance
    while t.hasSuffix("/") { t.removeLast() }
    var parts = ["instance=" + encode(t)]
    if let notificationId { parts.append("notification=" + encode(notificationId)) }
    for key in targetKeys {
      if let v = target[key], let name = params[key] { parts.append(name + "=" + encode(v)) }
    }
    return "/notification?" + parts.joined(separator: "&")
  }
}

/// One key a device holds for a subscription (one per account on the instance).
struct StoredPushKey {
  let privateKey: Data
  let publicKey: Data
  let auth: Data
}

/// What the app stores for a gateway subscription: `StoredPushKeys` in src/lib/push-platform-types.ts.
struct StoredPushRecord {
  let instance: String
  let name: String
  let apiBaseUrl: String
  let userId: String
  let mode: String
  let keys: [StoredPushKey]
  let accessToken: String?

  init?(json data: Data) {
    guard
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      object["v"] as? Int == 1,
      let instance = object["instance"] as? String,
      let name = object["name"] as? String,
      let apiBaseUrl = object["apiBaseUrl"] as? String,
      let userId = object["userId"] as? String,
      let rawKeys = object["keys"] as? [[String: Any]]
    else { return nil }
    self.instance = instance
    self.name = name
    self.apiBaseUrl = apiBaseUrl
    self.userId = userId
    self.mode = object["mode"] as? String ?? "encrypted"
    self.accessToken = object["accessToken"] as? String
    self.keys = rawKeys.compactMap { raw in
      guard
        let privateKey = (raw["privateKey"] as? String).flatMap(Base64URL.decode),
        let publicKey = (raw["p256dh"] as? String).flatMap(Base64URL.decode),
        let auth = (raw["auth"] as? String).flatMap(Base64URL.decode),
        privateKey.count == 32, publicKey.count == 65, auth.count == 16
      else { return nil }
      return StoredPushKey(privateKey: privateKey, publicKey: publicKey, auth: auth)
    }
  }
}
