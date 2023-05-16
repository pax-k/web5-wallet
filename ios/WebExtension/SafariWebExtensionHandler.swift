//
// Copyright © Square, Inc. All rights reserved.
//

import SafariServices
import os.log

// TODO: This class would need a clean-up with more robust error handling if we decide to go with WebExtensions.
// Lots of force-casts and hard-coded strings to get things up-and-running

struct NativeMessage: Codable {
  let command: Command

  enum Command: String, Codable {
    case getVCs
  }
}

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

  func beginRequest(with context: NSExtensionContext) {
    guard let nativeMessage = parseNativeMessage(from: context) else {
      log("Couldn't parse nativeMessage")
      context.completeRequest(returningItems: nil, completionHandler: nil)
      return
    }

    log("Building response")
    let response = NSExtensionItem()
    switch nativeMessage.command {
    case .getVCs:
      log("Getting all VCs from wallet")
      let vcs = getAllVCs()
      response.userInfo = [ SFExtensionMessageKey: vcs ]
    }

    log("Completing request and providing response")
    context.completeRequest(returningItems: [response], completionHandler: nil)
  }

  private func parseNativeMessage(from context: NSExtensionContext) -> NativeMessage? {
    let item = context.inputItems[0] as! NSExtensionItem
    guard let message = item.userInfo?[SFExtensionMessageKey] as? [String: String] else {
      log("message wasn't a dictionary")
      return nil
    }

    do {
      let messageData = try JSONEncoder().encode(message)
      let nativeMessage = try JSONDecoder().decode(NativeMessage.self, from: messageData)
      return nativeMessage
    } catch {
      log("Error parsing nativeMessage: \(error.localizedDescription)")
      return nil
    }
  }

  let appGroup = "group.org.name.web5wallet"

  private func getAllVCs() -> String {
    // Required manual setup of MMKV object, so that we can get the shared AppGroup data
    let groupDir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)!.path
    MMKV.initialize(rootDir: nil, groupDir: groupDir, logLevel: .none)

    let mmkv = MMKV(mmapID: "mmkv.default", cryptKey: nil, mode: .multiProcess)
    let credentialsData = mmkv?.data(forKey: "credentials")
    let credentialsString = String(data: credentialsData!, encoding: .utf8)

    return credentialsString!
  }

  private func log(_ message: String) {
    // Add a prefix to the logs so that I can easily find them in Console.app
    os_log(.default, "WalletWebExtension - %@", message)
  }

}
