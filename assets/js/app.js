$(function () {
  "use strict";

  // Create App object
  var App = {
    // Exported methods
    createvps: createvps,
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
  function createvps(caller, cloudInitScriptTemplate) {
    // Get the form calling this method
    var $form = $(caller).parents("form");

    // Get the required inputs from the form and validate them as much as we can
    var inputs = getInputsFromForm($form);
    validateInputs(inputs);

    // Generate passwords
    var vps_password = bip39.generateMnemonic();
    var ob_password = bip39.generateMnemonic();

    // Create a DO client
    var doClient = new DigitalOcean(inputs.token);

    // Perform the provisioning
    doClient.createDroplet({
        // Append utc epoch in milliseconds to name for uniqueness
        name: "obdroplet-" + (new Date().getTime()),

        // Add the MiniProvistor fingerprint
        ssh_keys: [sshPubKeyFingerprint],

        // Add settings
        region: inputs.region,
        size: inputs.size,

        // Use ubuntu 14.04 LTS
        image: "ubuntu-14-04-x64",

        user_data: Mustache.render(cloudInitScriptTemplate, {
          vps_password: vps_password,
          ob_password: ob_password,
        }),

        // No frills; users can opt-in later
        backups: false,
        ipv6: false,
        private_networking: null,
        volumes: null
      }).then(function (data) {
        return waitForCreation(doClient, data.droplet.id);
      })
      .done(function (data) {
        $("#dasinfo").html("OpenBazaar Installed on " + data.droplet.networks
          .v4[0].ip_address +
          "</br><strong>VPS password:</strong> <code>" +
          vps_password +
          "</code></br><strong>OB password:</strong> <code>" +
          ob_password + "</code>");
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
});
