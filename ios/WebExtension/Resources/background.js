const applicationID = "org.name.web5wallet"

browser.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  console.log("Received request: ", request);

  if (request.command === "getVC") {
    let sending = browser.runtime.sendNativeMessage(applicationID, { command: "getVCs" }, function(response) {
      console.log("Sending response: \n" + response);
      sendResponse(response);
    });

    // return true from the event listener to indicate you wish to send a response asynchronously
    // (this will keep the message channel open to the other end until sendResponse is called).
    return true;
  }
});
