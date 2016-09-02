$(function () {
  "use strict";

  // Create App object
  var App = {
    // Exported methods
    createvps: createvps,

    // Data
    devmode: /devmode/i.test(window.location.search),
    dropletId: null,
    droplet: null,
    hasSSHKeyInstalled: false
  };

  // Export App
  window.App = App;

  //
  // MiniProvistor client-side application logic begins
  //

  //
  // Constants
  //
  var dropletSizes = ['512mb', '1gb', '2gb'];
  var dropletRegions = ['nyc1', 'nyc2', 'nyc3', 'sfo1', 'sfo2'];

  var sshPubKey =
    "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCUNtHUhGE63rkQdpvITmtGVEjziKWxaoKknAFDhsWvaR4PqFguqGd90BlYlMJM11jwrnx1mY5bcWGhjGdg6K+Equw0mynGJdlKOUFD30FohPdhVUkeW5J0fzzR7WB8uV4NlG41TBCYIUsljbmC/jGNTQ/VV1mmL5KlVejnNSAkeC/bPZmu2RAK8WOkj7iZ+MfPfYZDlqJMsYHaQa6n9q7ah0ofzxolgXLcJTBPfBt6TvDGbGdYjNYD7EkGkclpPLyNII6U+4yluF6I2y0dVmVte8rplrNbxBgcz6+8I1uwzGUmEDMhtAu+SD65vB7qDpS9rxUq3MIKpiVvk8rhd+Q3 MiniProvistor";
  var sshPubKeyFingerprint =
    "77:b7:5b:68:de:ce:37:bd:f7:a4:95:dc:b2:b3:41:fa";

  var getDropletIPMaxAttempts = 60;
  var getDropletIPPollInterval = 1000;

  // create vps creates and sets up a droplet for production OpenBazaar use
  function createvps(caller) {
    // Get the form calling this method
    var $form = $(caller).parents("form");

    // Get the required inputs from the form and validate them as much as we can
    var inputs = getInputsFromForm($form);
    validateInputs(inputs);

    // Perform the provisioning
    provisionOpenBazaarDroplet(inputs.token, {
        // Append utc epoch in milliseconds to name for uniqueness
        name: "obdroplet-" + (new Date().getTime()),

        // Add the MiniProvistor fingerprint
        ssh_keys: [sshPubKeyFingerprint],

        // Add settings
        region: inputs.region,
        size: inputs.size,

        // Use ubuntu 16.04 LTS
        image: "ubuntu-16-04-x64",

        // No frills; users can opt-in later
        backups: false,
        ipv6: false,
        user_data: null,
        private_networking: null,
        volumes: null
      })
      .done(function () {
        $("#dasinfo").html("OpenBazaar Installed");
      })
      .fail(function (err) {
        handleError(err);
      });
  }

  //
  // Private methods
  //

  // handleError logs the error and shows it to the  user
  function handleError(error) {
    console.log("error creating droplet");
    $('#dasinfo').text("error creating droplet");
    return false;
  }

  // getInputsFromForm returns an object with the required inputs for node creation
  function getInputsFromForm($form) {
    return {
      token: $form.find("#token").val(),
      size: $form.find("#size").val(),
      region: $form.find("#region").val()
    }
  }

  // validateInputs validates the data from the form as much as we can
  function validateInputs(inputs) {
    // Basic token validation
    if (inputs.token.length != 64) {
      handleError("Token should be 64 characters");
      return
    }

    // Validate the size
    if (dropletSizes.indexOf(inputs.size) === -1) {
      handleError("Invalid droptlet size");
      return;
    }

    // Validate the region
    if (dropletRegions.indexOf(inputs.region) === -1) {
      handleError("Invalid droptlet region");
      return
    }
  }

  // provisionOpenBazaarDroplet creates a production ready OpenBazaar droplet
  // for the given token and data
  function provisionOpenBazaarDroplet(token, dropletData) {
    // Debugging info
    if (App.devmode) {
      console.log("Token: " + token);
      console.log("Droplet Config: " + JSON.stringify(dropletData));
    }

    var doClient = new DigitalOcean(token);

    // Return a promise to fullfil a long chain of commands to build a new droplet
    // Start with making sure we have the MiniProvistor ssh public key installed
    return ensureSSHKeyExists(doClient, sshPubKeyFingerprint)

    // Create the droplet
    .then(function () {
      return doClient.createDroplet(dropletData);
    })

    // Wait for the droplet to be created
    .then(function (data) {
      return waitForCreation(doClient, data.droplet.id);
    })

    // Install OpenBazaar on the droplet
    .then(function (data) {
      return setupDroplet(data.droplet.networks.v4[0].ip_address);
    })

    // Promise the caller we'll do our best to do all this
    .promise()
  }

  // ensureSSHKeyExists returns true or false dpending on whether or not that account
  // owning the token has the given ssh key fingerprint registered
  function ensureSSHKeyExists(doClient, fingerprint) {
    var deferred = $.Deferred();

    // If we know we have the key installed then we're good to go
    if (App.hasSSHKeyInstalled) {
      return deferred.resolve().promise();
    }

    // Get the key by fingerprint. If it doesn't exist create it.
    doClient.getSSHKeyByFingerprint(fingerprint)
      .done(function () {
        App.hasSSHKeyInstalled = true;
        return deferred.resolve.apply(this, arguments);
      })
      .fail(function (err) {
        // Key doesn't exist so we'll create it
        if (err.status === 404) {
          App.hasSSHKeyInstalled = false

          // Create the key
          return doClient.createSSHKey("MiniProvistor SSH Key", sshPubKey)
            .done(function () {
              App.hasSSHKeyInstalled = true
              return deferred.resolve.apply(this, arguments)
            })
            .fail(function () {
              return deferred.reject.apply(this, arguments);
            });
        }

        // It was a real error, fail
        return deferred.reject.apply(this, arguments)
      });

    // Return a promise for the check/create actions
    return deferred.promise();
  }

  // waitForCreation polls the api X times trying to get the ip
  function waitForCreation(doClient, dropletId) {
    var deferred = $.Deferred();
    var attempts = 0;

    // poll gets droplet data and if an ipv4 exists we stop, otherwise keep going
    // until the configured stopping point
    function poll() {
      doClient.getDroplet(dropletId)
        .done(function (data) {
          if (data.droplet.networks.v4.length) {
            deferred.resolve(data);
            return data;
          }

          if (attempts >= getDropletIPMaxAttempts) {
            deferred.reject(data);
          }

          attempts++
          setTimeout(poll, getDropletIPPollInterval);
        })
        .fail(function () {
          defer.reject.apply(this, arguments);
        });
    }

    // Start polling
    poll();

    // Return a promise to try really hard or fail
    return deferred.promise();
  }

  // setupDroplet turns the bare droplet into a production OpenBazaar server
  function setupDroplet(ip_address) {
    return $.ajax({
      url: "http://localhost:8080/api/v1/provision",
      type: 'POST',
      dataType: 'json',
      contentType: 'application/json',
      processData: true,
      data: JSON.stringify({
        ip_address: ip_address,
      })
    }).promise();
  }
});
