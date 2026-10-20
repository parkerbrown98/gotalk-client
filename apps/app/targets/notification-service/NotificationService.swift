import Foundation
import UserNotifications

/// Every push from the Gotalk gateway arrives as an alert reading "New notification" (`GT_NEW_NOTIFICATION`) with
/// `mutable-content`. This extension replaces that text with the decrypted notification, or, for `id_only`
/// subscriptions, with the notification fetched from the instance. When neither works in time, the generic text
/// stays, with the instance's name when the subscription is known.
final class NotificationService: UNNotificationServiceExtension {
  private let lock = NSLock()
  private var contentHandler: ((UNNotificationContent) -> Void)?
  private var content: UNMutableNotificationContent?
  private var fetch: URLSessionDataTask?

  override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
    guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else {
      contentHandler(request.content)
      return
    }
    lock.lock()
    self.contentHandler = contentHandler
    self.content = content
    lock.unlock()

    content.title = NSLocalizedString("GT_NEW_NOTIFICATION", value: "New notification", comment: "Shown when a push cannot be read")
    content.body = ""

    guard
      let gt = content.userInfo["gt"] as? [String: Any],
      let sub = gt["sub"] as? String,
      let record = PushKeyStore.read(subscriptionId: sub)
    else {
      finish()
      return
    }
    // Always name the instance, so one instance cannot pass for another sender.
    content.subtitle = record.name
    content.threadIdentifier = record.instance + "|fallback"
    setTarget(content, instance: record.instance, path: Route.open(instance: record.instance, notificationId: nil, target: [:]))

    switch gt["mode"] as? String {
    case "encrypted":
      if let text = gt["body"] as? String,
        let body = Base64URL.decode(text),
        let plaintext = PushCrypto.decrypt(body: body, keys: record.keys),
        let payload = PushPayload(json: plaintext),
        Route.sameInstance(payload.instance, record.instance)
      {
        apply(payload, name: record.name, to: content)
      }
      finish()
    case "id_only":
      guard
        let instance = gt["instance"] as? String,
        let notificationId = gt["notification_id"] as? String,
        Route.sameInstance(instance, record.instance)
      else {
        finish()
        return
      }
      setTarget(content, instance: record.instance, path: Route.open(instance: record.instance, notificationId: notificationId, target: [:]))
      fetchNotification(record: record, id: notificationId) { [weak self] payload in
        guard let self else { return }
        // Only while the content has not been handed back on expiry.
        self.lock.lock()
        if self.contentHandler != nil, let payload { self.apply(payload, name: record.name, to: content) }
        self.lock.unlock()
        self.finish()
      }
    default:
      finish()
    }
  }

  override func serviceExtensionTimeWillExpire() {
    lock.lock()
    let task = fetch
    lock.unlock()
    task?.cancel()
    finish()
  }

  private func finish() {
    lock.lock()
    let handler = contentHandler
    let current = self.content
    contentHandler = nil
    lock.unlock()
    if let handler, let current { handler(current) }
  }

  private func apply(_ payload: PushPayload, name: String, to content: UNMutableNotificationContent) {
    let title = payload.title.trimmingCharacters(in: .whitespacesAndNewlines)
    if !title.isEmpty { content.title = title }
    content.subtitle = name
    content.body = payload.body ?? ""
    content.threadIdentifier = payload.instance + "|" + (payload.threadId ?? payload.notificationId)
    if let badge = payload.badge { content.badge = NSNumber(value: badge) }
    setTarget(content, instance: payload.instance, path: Route.open(instance: payload.instance, notificationId: payload.notificationId, target: payload.target))
  }

  /// expo-notifications hands `userInfo["body"]` to JavaScript as the notification's data.
  private func setTarget(_ content: UNMutableNotificationContent, instance: String, path: String) {
    var info = content.userInfo
    info["body"] = ["gotalk_open": path, "gotalk_instance": instance]
    content.userInfo = info
  }

  /// `id_only`: the notification from the instance, with the access token the app last shared. The token is short
  /// lived, so this works soon after the app was used and falls back to the generic text otherwise.
  private func fetchNotification(record: StoredPushRecord, id: String, completion: @escaping (PushPayload?) -> Void) {
    guard
      let token = record.accessToken,
      let url = URL(string: record.apiBaseUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/users/@me/notifications?limit=50")
    else {
      completion(nil)
      return
    }
    var request = URLRequest(url: url, timeoutInterval: 20)
    request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    let task = URLSession.shared.dataTask(with: request) { data, response, _ in
      guard
        let data,
        (response as? HTTPURLResponse)?.statusCode == 200,
        let page = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
        let items = page["items"] as? [[String: Any]],
        let item = items.first(where: { $0["id"] as? String == id })
      else {
        completion(nil)
        return
      }
      completion(PushPayload(notification: item, instance: record.instance, userId: record.userId))
    }
    lock.lock()
    fetch = task
    lock.unlock()
    task.resume()
  }
}
