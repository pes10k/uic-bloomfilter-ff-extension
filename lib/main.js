var chrome = require("chrome");
var tabs = require("sdk/tabs");
var self = require("sdk/self");
var request = require("sdk/request");
var buttons = require('sdk/ui/button/action');
var bloomFilter = require('./bloomfilter.js').readOnlyBloomFilter;
var fileIO = require("sdk/io/file");

var components = chrome.components;

var button = buttons.ActionButton({
  id: "bloomfilter-crl-button",
  label: "unsure",
  icon: self.data.url("images/icon-unsure.png")
});

var STATES = {
  UNSURE: 0,
  POSITIVE: 1,
  NEGATIVE: 2
};

var url_cache = {};


var setButtonState = function (state) {

  // console.log("Cert state is " + state);
  // return;

  switch (state) {
    case STATES.UNSURE:
      button.icon = self.data.url("images/icon-unsure.png");
      button.label = "Unsure";
      break;

    case STATES.POSITIVE:
      button.icon = self.data.url("images/icon-insecure.png");
      button.label = "Cert is Revoked";
      break;

    case STATES.NEGATIVE:
      button.icon = self.data.url("images/icon-secure.png");
      button.label = "Cert is not Revoked";
      break;
  }

  return state;
};


var loadedFilters = {};
var filterForCommonName = function (issuerCommonName) {

  if (issuerCommonName in loadedFilters) {
    return loadedFilters[issuerCommonName];
  }

  var encodedFilter = null;
  try {
    encodedFilter = self.data.load("filters/" + issuerCommonName);
  }
  catch (e) {
    return false;
  }

  loadedFilters[issuerCommonName] = bloomFilter(encodedFilter);
  return loadedFilters[issuerCommonName];
};

var currentCertificateSerialNumber = function (channel) {

    const {Cc, Ci, Cr} = require("chrome");
    var secInfo = channel.securityInfo;

    if (!(secInfo instanceof Ci.nsISSLStatusProvider)) {
      return setButtonState(STATES.UNSURE);
    }

    var cert = secInfo.QueryInterface(Ci.nsISSLStatusProvider).
      SSLStatus.QueryInterface(Ci.nsISSLStatus).serverCert;

    var issuerCommonName = cert.issuerCommonName;
    var certSerialNumber = cert.serialNumber.replace(/:/g, "");
    var filterForIssuer = filterForCommonName(issuerCommonName);

    if (!filterForIssuer) {
      return setButtonState(STATES.UNSURE);
    }

    var certInFilter = filterForIssuer.check(certSerialNumber);

    if (certInFilter) {
      return setButtonState(STATES.POSITIVE);
    } else {
      return setButtonState(STATES.NEGATIVE);
    }
};

var requestForUrl = function (url, callback) {

    const {Cc} = require("chrome");

    var req = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance();
    req.open('GET', url, true);
    req.onload = function (e) {
        var channel = req.channel;
        callback(currentCertificateSerialNumber(channel));
    };

    req.send();
};


tabs.on("activate", function (tab) {

  if (tab.url in url_cache) {
    setButtonState(url_cache[tab.url]);
    return;
  }

  requestForUrl(tab.url, function (result) {
    url_cache[tab.url] = result;
  });

});

tabs.on("ready", function (tab) {

  if (tab.url in url_cache) {
    setButtonState(url_cache[tab.url]);
    return;
  }

  requestForUrl(tab.url, function (result) {
    url_cache[tab.url] = result;
  });
});

