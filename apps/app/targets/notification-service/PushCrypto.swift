import CryptoKit
import Foundation

/// RFC 8291 (Message Encryption for Web Push) with the `aes128gcm` content coding of RFC 8188, exactly as
/// `decryptPushBody` in @gotalk/core does it. The instance encrypts one record to this device's key; only this
/// device holds the private key.
enum PushCrypto {
  enum Failure: Error {
    case malformed
    case wrongKey
  }

  /// Tries each key the device holds for the subscription and returns the first plaintext that opens.
  static func decrypt(body: Data, keys: [StoredPushKey]) -> Data? {
    for key in keys {
      do {
        return try decrypt(body: body, key: key)
      } catch Failure.malformed {
        return nil
      } catch {
        continue
      }
    }
    return nil
  }

  static func decrypt(body: Data, key: StoredPushKey) throws -> Data {
    let bytes = [UInt8](body)
    guard bytes.count >= 21 else { throw Failure.malformed }
    let salt = Data(bytes[0..<16])
    let recordSize = UInt32(bytes[16]) << 24 | UInt32(bytes[17]) << 16 | UInt32(bytes[18]) << 8 | UInt32(bytes[19])
    let idLength = Int(bytes[20])
    guard bytes.count >= 21 + idLength else { throw Failure.malformed }
    let senderPublic = Data(bytes[21..<(21 + idLength)])
    let ciphertext = Data(bytes[(21 + idLength)...])
    guard recordSize >= 18, ciphertext.count <= Int(recordSize), ciphertext.count >= 17 else { throw Failure.malformed }

    let shared: SharedSecret
    do {
      let privateKey = try P256.KeyAgreement.PrivateKey(rawRepresentation: key.privateKey)
      let senderKey = try P256.KeyAgreement.PublicKey(x963Representation: senderPublic)
      shared = try privateKey.sharedSecretFromKeyAgreement(with: senderKey)
    } catch {
      throw Failure.malformed
    }

    // IKM = HKDF(salt: auth, ikm: ECDH secret, info: "WebPush: info" 0x00 ua_public as_public, 32)
    var keyInfo = Data("WebPush: info".utf8)
    keyInfo.append(0)
    keyInfo.append(key.publicKey)
    keyInfo.append(senderPublic)
    let ikm = HKDF<SHA256>.deriveKey(
      inputKeyMaterial: SymmetricKey(data: shared.withUnsafeBytes { Data($0) }),
      salt: key.auth,
      info: keyInfo,
      outputByteCount: 32
    )

    var cekInfo = Data("Content-Encoding: aes128gcm".utf8)
    cekInfo.append(0)
    var nonceInfo = Data("Content-Encoding: nonce".utf8)
    nonceInfo.append(0)
    let contentKey = HKDF<SHA256>.deriveKey(inputKeyMaterial: ikm, salt: salt, info: cekInfo, outputByteCount: 16)
    let nonceKey = HKDF<SHA256>.deriveKey(inputKeyMaterial: ikm, salt: salt, info: nonceInfo, outputByteCount: 12)

    var record: [UInt8]
    do {
      let nonce = try AES.GCM.Nonce(data: nonceKey.withUnsafeBytes { Data($0) })
      let sealed = try AES.GCM.SealedBox(nonce: nonce, ciphertext: ciphertext.prefix(ciphertext.count - 16), tag: ciphertext.suffix(16))
      record = [UInt8](try AES.GCM.open(sealed, using: contentKey))
    } catch {
      throw Failure.wrongKey
    }
    // Padding is zero bytes after a 0x02 delimiter (RFC 8188 section 2).
    while let last = record.last, last == 0 {
      record.removeLast()
    }
    guard record.last == 0x02 else { throw Failure.malformed }
    record.removeLast()
    return Data(record)
  }
}

enum Base64URL {
  static func decode(_ text: String) -> Data? {
    var s = text.trimmingCharacters(in: .whitespacesAndNewlines)
      .replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
    while s.count % 4 != 0 {
      s.append("=")
    }
    return Data(base64Encoded: s)
  }
}
