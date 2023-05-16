const applicationID = "org.name.web5wallet"

browser.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  console.log("Received request: ", request);

  if (request.command === "getVC") {
    console.log("fuckyea");
    browser.runtime.sendNativeMessage(applicationID, { message: "Hello from background page" }, function(response) {
      console.log("Received sendNativeMessage response: " + JSON.stringify(response));
    });
  }
});
